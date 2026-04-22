import Image from 'next/image';

type NoxivoLogoVariant = 'auto' | 'light' | 'dark';

interface NoxivoLogoProps {
  alt?: string;
  className?: string;
  height?: number;
  imageClassName?: string;
  priority?: boolean;
  variant?: NoxivoLogoVariant;
  width?: number;
}

function renderLogo({
  alt,
  height,
  imageClassName,
  priority,
  src,
  width,
}: NoxivoLogoProps & { src: string }): JSX.Element {
  return (
    <Image
      alt={alt ?? 'Noxivo logo'}
      className={imageClassName}
      height={height}
      priority={priority}
      src={src}
      width={width}
      style={{ width: 'auto', height: '100%' }}
    />
  );
}

export function NoxivoLogo({
  alt = 'Noxivo logo',
  className,
  height = 40,
  imageClassName,
  priority = false,
  variant = 'auto',
  width = 160,
}: NoxivoLogoProps): JSX.Element {
  if (variant === 'light') {
    return (
      <div className={className} style={{ height }}>
        {renderLogo({ alt, className, height, imageClassName, priority, src: '/images/noxivo-logo.png', width })}
      </div>
    );
  }

  if (variant === 'dark') {
    return (
      <div className={className} style={{ height }}>
        {renderLogo({ alt, className, height, imageClassName, priority, src: '/images/noxivo-logo-dark.png', width })}
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      {renderLogo({ alt, className, height, imageClassName: `${imageClassName ?? ''} block dark:hidden`.trim(), priority, src: '/images/noxivo-logo-dark.png', width })}
      {renderLogo({ alt, className, height, imageClassName: `${imageClassName ?? ''} hidden dark:block`.trim(), priority, src: '/images/noxivo-logo.png', width })}
    </div>
  );
}
