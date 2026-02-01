import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 安全合并 Tailwind CSS 类名
 * 使用 clsx 处理条件类名，用 tailwind-merge 解决 Tailwind 类名冲突
 * 
 * @example
 * cn('px-2', 'px-4') // 结果: 'px-4' (后者覆盖前者)
 * cn('btn', isActive && 'btn-active') // 条件类名
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}