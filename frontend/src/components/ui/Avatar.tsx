interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  src?: string;
}

const sizeClasses = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-xl',
};

const colors = [
  'bg-[#2d6a4f]',
  'bg-[#1e40af]',
  'bg-[#92400e]',
  'bg-[#7c3aed]',
  'bg-[#be185d]',
  'bg-[#0f766e]',
];

function getColor(name: string) {
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Avatar({ name, size = 'md', color, src }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${color || getColor(name)} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}
    >
      {getInitials(name)}
    </div>
  );
}
