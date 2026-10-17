// Verkleinert Fotos vor dem Speichern, damit die lokale Datenbank und Backups klein bleiben.
export function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/webp', quality);
        // Ältere Safari-Versionen können kein WebP erzeugen und liefern PNG – dann JPEG nehmen
        resolve(compressed.startsWith('data:image/webp') ? compressed : canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
