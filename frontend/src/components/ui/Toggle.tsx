import { useState } from 'react';

interface ToggleProps {
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
}

export default function Toggle({ defaultChecked = false, onChange }: ToggleProps) {
  const [checked, setChecked] = useState(defaultChecked);

  const handleChange = () => {
    const next = !checked;
    setChecked(next);
    onChange?.(next);
  };

  return (
    <label className="toggle-switch cursor-pointer">
      <input type="checkbox" checked={checked} onChange={handleChange} />
      <span className="toggle-slider" />
    </label>
  );
}
