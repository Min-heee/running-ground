import { Button } from '@/components/ui/Button';

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return <Button label={label} onPress={onPress} disabled={disabled} variant="secondary" />;
}
