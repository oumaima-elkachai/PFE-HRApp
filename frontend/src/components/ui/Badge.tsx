interface BadgeProps {
  children: React.ReactNode;
  variant?: 'green' | 'blue' | 'amber' | 'red' | 'gray' | 'olive';
  size?: 'sm' | 'md';
  className?: string;
}

const variantClasses = {
  green: 'bg-[#d8f3dc] text-[#2d6a4f] border border-[#b7e4c7]',
  blue: 'bg-[#dbeafe] text-[#1e40af] border border-[#bfdbfe]',
  amber: 'bg-[#fef3c7] text-[#92400e] border border-[#fde68a]',
  red: 'bg-[#fee2e2] text-[#991b1b] border border-[#fecaca]',
  gray: 'bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb]',
  olive: 'bg-[#2d6a4f] text-white',
};

const sizeClasses = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

export default function Badge({ children, variant = 'green', size = 'sm', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full uppercase tracking-wide ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  );
}
