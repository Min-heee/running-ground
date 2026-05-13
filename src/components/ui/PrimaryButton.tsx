import { Button } from '@/components/ui/Button';

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return <Button label={label} onPress={onPress} disabled={disabled} variant="primary" />;
}
