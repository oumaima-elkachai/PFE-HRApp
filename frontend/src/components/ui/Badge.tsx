interface BadgeProps {
  children: React.ReactNode;
  variant?: 'green' | 'blue' | 'amber' | 'red' | 'gray' | 'olive';
  size?: 'sm' | 'md';
  className?: string;
}

const variantClasses = {
  green: 'bg-brand-100 text-brand-texte border border-[#b7e4c7]',
  blue: 'bg-blue-100 text-[#1e40af] border border-[#bfdbfe]',
  amber: 'bg-amber-100 text-[#92400e] border border-[#fde68a]',
  red: 'bg-red-100 text-[#991b1b] border border-[#fecaca]',
  gray: 'bg-stone-100 text-stone-700 border border-stone-200',
  olive: 'bg-brand-600 text-white',
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
