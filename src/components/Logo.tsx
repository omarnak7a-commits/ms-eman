import logoImg from '@/imports/Max_a_____________________-Photoroom-1.png';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const heights: Record<string, string> = { sm: 'h-8', md: 'h-12', lg: 'h-16' };
  // When the caller supplies its own (possibly responsive) height classes, let
  // those win instead of the fixed `size` height so we can scale on mobile.
  const hasHeightOverride = /\bh-[\w.[\]]+/.test(className);
  const heightCls = hasHeightOverride ? '' : (heights[size] ?? 'h-12');
  return (
    <img
      src={logoImg}
      alt="Test Yourself – Ms Eman Zahy"
      className={`${heightCls} w-auto object-contain ${className}`}
    />
  );
}
