import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: number | string;
  radius?: number;
  as?: 'div' | 'section';
}

/** Flat surface card (22–28px radius, hairline border). */
export function Card({ padding = 16, radius = 24, as = 'div', style, children, ...rest }: CardProps) {
  const Tag = as;
  return (
    <Tag
      {...rest}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: radius,
        boxShadow: 'var(--card-shadow)',
        padding,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/** Section heading row: title on the start side, optional meta on the end side. */
export function SectionHeader({
  title,
  meta,
  style,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 8,
        ...style,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
      {meta != null && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{meta}</span>}
    </div>
  );
}
