'use client';
import { useEffect } from 'react';

/** Gắn nút "Sao chép" vào mọi khối lệnh trong nội dung README. */
export default function CodeEnhancer({ root = '.prose-readme' }: { root?: string }) {
  useEffect(() => {
    const blocks = document.querySelectorAll<HTMLPreElement>(`${root} pre`);
    blocks.forEach((pre) => {
      if (pre.querySelector('.code-copy')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy';
      btn.textContent = 'Sao chép';
      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.innerText ?? pre.innerText;
        try { await navigator.clipboard.writeText(code.replace(/\n$/, '')); btn.textContent = 'Đã chép'; } catch { btn.textContent = 'Không chép được'; }
        setTimeout(() => { btn.textContent = 'Sao chép'; }, 1500);
      });
      pre.appendChild(btn);
    });
  }, [root]);
  return null;
}
