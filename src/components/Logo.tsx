import logoImg from '@/imports/Max_a_____________________-Photoroom-1.png';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const heights: Record<string, string> = { sm: 'h-8', md: 'h-12', lg: 'h-16' };
  return (
    <img
      src={logoImg}
      alt="Test Yourself – Ms Eman Zahy"
      className={`${heights[size]} w-auto object-contain ${className}`}
    />
  );
}
