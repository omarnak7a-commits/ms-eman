import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { ProtectedRoute } from "@/components/ProtectedRoute"

function renderRoute(isAuthenticated: boolean, authLoading = false) {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route
          element={
            <ProtectedRoute
              isAuthenticated={isAuthenticated}
              authLoading={authLoading}
            />
          }
        >
          <Route path="/dashboard" element={<p>Protected dashboard</p>} />
        </Route>
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("ProtectedRoute", () => {
  it("waits without redirecting while auth is being restored", () => {
    renderRoute(false, true)

    expect(screen.queryByText("Protected dashboard")).toBeNull()
    expect(screen.queryByText("Login page")).toBeNull()
    expect(document.querySelector(".animate-spin")).not.toBeNull()
  })

  it("renders protected content after a valid restore", () => {
    renderRoute(true)

    expect(screen.getByText("Protected dashboard")).toBeTruthy()
  })

  it("redirects to login only after restoration finishes", () => {
    renderRoute(false)

    expect(screen.getByText("Login page")).toBeTruthy()
  })
})
