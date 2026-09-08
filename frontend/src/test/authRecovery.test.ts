import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  request,
  setTokens,
} from "@/lib/api/client"
import {
  getSession,
  resetSessionRestoreForTests,
  restoreSession,
} from "@/lib/auth"
import { storageSet } from "@/lib/storage"

const TEACHER = {
  id: "teacher-1",
  name: "Ms Eman Zahy",
  email: "ms.eman.zahy@test.com",
  role: "teacher" as const,
  created_at: "2026-01-01T00:00:00Z",
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function urlOf(input: RequestInfo | URL): string {
  return String(input)
}

beforeEach(() => {
  localStorage.clear()
  resetSessionRestoreForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearTokens()
  localStorage.clear()
})

describe("teacher request recovery", () => {
  it("refreshes once, persists both rotated tokens, and retries the request", async () => {
    setTokens("expired-access", "refresh-1")
    const calls: Array<{ url: string; authorization: string | null }> = []

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input)
        calls.push({
          url,
          authorization: new Headers(init?.headers).get("Authorization"),
        })

        if (url.endsWith("/auth/refresh")) {
          expect(JSON.parse(String(init?.body))).toEqual({
            refresh_token: "refresh-1",
          })
          expect(new Headers(init?.headers).get("Authorization")).toBeNull()
          return jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            expires_in: 900,
          })
        }
        if (
          url.endsWith("/dashboard") &&
          calls.at(-1)?.authorization === "Bearer expired-access"
        ) {
          return jsonResponse(401, { message: "Invalid or expired token." })
        }
        return jsonResponse(200, { ok: true })
      }),
    )

    await expect(request<{ ok: boolean }>("/dashboard")).resolves.toEqual({
      ok: true,
    })

    expect(getAccessToken()).toBe("access-2")
    expect(getRefreshToken()).toBe("refresh-2")
    expect(
      calls.filter((call) => call.url.endsWith("/auth/refresh")),
    ).toHaveLength(1)
    expect(
      calls.filter((call) => call.url.endsWith("/dashboard")),
    ).toHaveLength(2)
    expect(calls.at(-1)?.authorization).toBe("Bearer access-2")
  })

  it("shares one in-flight refresh across concurrent 401 responses", async () => {
    setTokens("expired-access", "refresh-1")
    let refreshCalls = 0
    let releaseRefresh: () => void = () => {
      throw new Error('refresh gate was not initialized')
    }
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input)
        if (url.endsWith("/auth/refresh")) {
          refreshCalls += 1
          await refreshGate
          return jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            expires_in: 900,
          })
        }
        const auth = new Headers(init?.headers).get("Authorization")
        if (auth === "Bearer expired-access") {
          return jsonResponse(401, { message: "Invalid or expired token." })
        }
        return jsonResponse(200, { ok: true })
      }),
    )

    const first = request<{ ok: boolean }>("/dashboard")
    const second = request<{ ok: boolean }>("/exams")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(refreshCalls).toBe(1)

    releaseRefresh()
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ])
    expect(refreshCalls).toBe(1)
  })

  it("does not erase a valid session when refresh fails transiently", async () => {
    setTokens("expired-access", "refresh-1")
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const auth = new Headers(init?.headers).get("Authorization")
        if (auth === "Bearer expired-access") {
          return jsonResponse(401, { message: "Invalid or expired token." })
        }
        if (urlOf(input).endsWith("/auth/refresh")) {
          throw new TypeError("network unavailable")
        }
        return jsonResponse(200, { ok: true })
      }),
    )

    await expect(request("/dashboard")).rejects.toMatchObject({ status: 401 })
    expect(getAccessToken()).toBe("expired-access")
    expect(getRefreshToken()).toBe("refresh-1")
  })

  it("retries with a token rotated by another browser tab", async () => {
    setTokens("expired-access", "refresh-1")
    let refreshCalls = 0

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input)
        if (url.endsWith("/auth/refresh")) {
          refreshCalls += 1
          if (refreshCalls === 1) {
            // Simulate the sibling tab winning the rotation race.
            setTokens("access-from-tab", "refresh-from-tab")
            return jsonResponse(401, {
              message: "Invalid or revoked refresh token.",
            })
          }
          expect(JSON.parse(String(init?.body))).toEqual({
            refresh_token: "refresh-from-tab",
          })
          return jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            expires_in: 900,
          })
        }
        const auth = new Headers(init?.headers).get("Authorization")
        if (auth !== "Bearer access-2") {
          return jsonResponse(401, { message: "Invalid or expired token." })
        }
        return jsonResponse(200, { ok: true })
      }),
    )

    await expect(request<{ ok: boolean }>("/dashboard")).resolves.toEqual({
      ok: true,
    })
    expect(refreshCalls).toBe(2)
    expect(getRefreshToken()).toBe("refresh-2")
  })

  it("does not refresh student or public requests after a 401", async () => {
    setTokens("access-1", "refresh-1")
    let refreshCalls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (urlOf(input).endsWith("/auth/refresh")) refreshCalls += 1
        return jsonResponse(401, { message: "Unauthorized" })
      }),
    )

    await expect(
      request("/attempts/1", { auth: "student", token: "student-token" }),
    ).rejects.toMatchObject({
      status: 401,
    })
    await expect(request("/auth/login", { auth: null })).rejects.toMatchObject({
      status: 401,
    })
    expect(refreshCalls).toBe(0)
    expect(getRefreshToken()).toBe("refresh-1")
  })
})

describe("session restoration", () => {
  it("validates a persisted session once and updates the cached teacher", async () => {
    setTokens("access-1", "refresh-1")
    storageSet("ty_teacher", JSON.stringify(TEACHER))
    let meCalls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (urlOf(input).endsWith("/auth/me")) {
          meCalls += 1
          return jsonResponse(200, { teacher: TEACHER })
        }
        return jsonResponse(404, {})
      }),
    )

    const first = restoreSession()
    const second = restoreSession()
    expect(first).toBe(second)
    await expect(first).resolves.toEqual(TEACHER)
    expect(getSession()).toEqual(TEACHER)
    expect(meCalls).toBe(1)
  })

  it("restores through one refresh when the access token has expired", async () => {
    setTokens("expired-access", "refresh-1")
    storageSet("ty_teacher", JSON.stringify(TEACHER))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input)
        if (url.endsWith("/auth/refresh")) {
          return jsonResponse(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            expires_in: 900,
          })
        }
        if (url.endsWith("/auth/me")) {
          const auth = new Headers(init?.headers).get("Authorization")
          if (auth === "Bearer expired-access") {
            return jsonResponse(401, { message: "Invalid or expired token." })
          }
          return jsonResponse(200, { teacher: TEACHER })
        }
        return jsonResponse(404, {})
      }),
    )

    await expect(restoreSession()).resolves.toEqual(TEACHER)
    expect(getAccessToken()).toBe("access-2")
    expect(getRefreshToken()).toBe("refresh-2")
  })

  it("clears a profile when the refresh session is definitively invalid", async () => {
    setTokens("expired-access", "revoked-refresh")
    storageSet("ty_teacher", JSON.stringify(TEACHER))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (urlOf(input).endsWith("/auth/refresh")) {
          return jsonResponse(401, {
            message: "Invalid or revoked refresh token.",
          })
        }
        return jsonResponse(401, { message: "Invalid or expired token." })
      }),
    )

    await expect(restoreSession()).resolves.toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(getSession()).toBeNull()
  })
})
