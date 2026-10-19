import { Directive, ElementRef, HostListener, inject, Renderer2 } from '@angular/core';

function matchesAccept(file: File, accept: string): boolean {
  const parts = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return parts.some((p) => {
    if (p.endsWith('/*')) return type.startsWith(p.slice(0, -1));
    if (p.startsWith('.')) return name.endsWith(p);
    return type === p;
  });
}

@Directive({
  selector: '[appPasteDrop]',
  standalone: true,
})
export class PasteDropDirective {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private dragDepth = 0;

  private findInput(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector('input[type="file"]');
  }

  private forwardFiles(files: File[]): void {
    const input = this.findInput();
    if (!input || files.length === 0) return;
    const accepted = files.filter((f) => matchesAccept(f, input.accept));
    if (accepted.length === 0) return;
    const picked = input.multiple ? accepted : accepted.slice(0, 1);
    try {
      const dt = new DataTransfer();
      for (const f of picked) dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      /* older engines: ignore, native picker still works */
    }
    this.renderer.addClass(this.host.nativeElement, 'paste-flash');
    window.setTimeout(() => this.renderer.removeClass(this.host.nativeElement, 'paste-flash'), 600);
  }

  private filesFromClipboard(e: ClipboardEvent): File[] {
    const out: File[] = [];
    const items = e.clipboardData?.items;
    if (!items) return out;
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) out.push(f);
      }
    }
    return out;
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || typeof (el as HTMLElement).closest !== 'function') return false;
    return !!(el as HTMLElement).closest('input, textarea, select, [contenteditable="true"]');
  }

  @HostListener('document:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (this.isTypingTarget(event.target)) return;
    if (!this.host.nativeElement.isConnected) return;
    const files = this.filesFromClipboard(event);
    if (files.length === 0 || !this.findInput()) return;
    event.preventDefault();
    this.forwardFiles(files);
  }

  @HostListener('dragenter', ['$event'])
  onDragEnter(event: DragEvent): void {
    if (!event.dataTransfer || !this.findInput()) return;
    if (!Array.from(event.dataTransfer.types ?? []).includes('Files')) return;
    event.preventDefault();
    this.dragDepth++;
    this.renderer.addClass(this.host.nativeElement, 'dragging');
  }

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer || !this.findInput()) return;
    if (!Array.from(event.dataTransfer.types ?? []).includes('Files')) return;
    event.preventDefault();
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    if (!this.findInput()) return;
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.renderer.removeClass(this.host.nativeElement, 'dragging');
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    if (!this.findInput()) return;
    event.preventDefault();
    this.dragDepth = 0;
    this.renderer.removeClass(this.host.nativeElement, 'dragging');
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) this.forwardFiles(Array.from(files));
  }
}
