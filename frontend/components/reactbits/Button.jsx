'use client';

import { ArrowRight } from 'lucide-react';
import React from 'react';

/**
 * Theme-aware animated button with arrow reveal.
 *
 * @param {object} props
 * @param {string}  props.label         – button text (default "About")
 * @param {string}  props.bg            – idle background
 * @param {string}  props.fg            – idle text colour
 * @param {string}  props.hoverBg       – expand-circle background
 * @param {string}  props.hoverFg       – hover text colour
 * @param {string}  props.borderColor   – border colour
 * @param {string}  [props.className]   – extra classes
 * @param {string}  [props.variant]     – "glass" for transparent glass finish
 * @param {Function} [props.onClick]
 */
function ButtonCreativeRight({
  label = 'About',
  bg = '#ffffff',
  fg = '#000000',
  hoverBg = '#263381',
  hoverFg = '#ffffff',
  borderColor = 'transparent',
  className = '',
  variant,
  onClick,
  ...rest
}) {
  const isGlass = variant === 'glass';

  return (
    <div
      className={`group relative cursor-pointer px-6 py-3 w-fit rounded-full overflow-hidden text-center font-semibold transition-colors ${className}`}
      style={{
        background: isGlass ? 'rgba(255,255,255,0.06)' : bg,
        color: fg,
        border: `1px solid ${isGlass ? 'rgba(255,255,255,0.15)' : borderColor}`,
        backdropFilter: isGlass ? 'blur(16px) saturate(1.4)' : undefined,
        WebkitBackdropFilter: isGlass ? 'blur(16px) saturate(1.4)' : undefined,
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      {...rest}
    >
      <span className='translate-x-1 group-hover:translate-x-12 group-hover:opacity-0 transition-all duration-300 inline-block'>
        {label}
      </span>
      <div
        className='flex gap-2 z-10 items-center absolute top-0 h-full w-full justify-center translate-x-12 opacity-0 group-hover:-translate-x-1 group-hover:opacity-100 transition-all duration-300'
        style={{ color: hoverFg }}
      >
        <span>{label}</span>
        <ArrowRight size={18} />
      </div>
      <div
        className='absolute top-[40%] left-[20%] h-2 w-2 group-hover:h-full group-hover:w-full rounded-lg scale-[1] group-hover:scale-[1.8] transition-all duration-300 group-hover:top-[0%] group-hover:left-[0%]'
        style={{ background: isGlass ? 'rgba(255,255,255,0.12)' : hoverBg }}
      />
    </div>
  );
}

export default ButtonCreativeRight;
