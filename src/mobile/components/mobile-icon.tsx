import { Icon, type IconProps } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

type MobileIconScale = 'small' | 'medium' | 'action' | 'large' | 'hero'

export function MobileIcon({
  scale = 'medium',
  className,
  ...props
}: Omit<IconProps, 'size'> & { scale?: MobileIconScale }) {
  return <Icon {...props} size={18} className={cn('mobile-icon', `is-${scale}`, className)} />
}
