export async function exportDashboardPDF(elementId: string, customerName: string) {
  const { default: jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas');

  const element = document.getElementById(elementId);
  if (!element) throw new Error('Dashboard element not found');

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#f9fafb',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW - 20;
  const imgH = (canvas.height * imgW) / canvas.width;

  let y = 10;
  const dateStr = new Date().toLocaleDateString();
  pdf.setFontSize(14);
  pdf.text(`CAST AI ROI Report — ${customerName}`, 10, y);
  pdf.setFontSize(10);
  pdf.setTextColor(150);
  pdf.text(`Generated: ${dateStr}`, 10, y + 6);
  pdf.setTextColor(0);
  y += 14;

  // Paginate if content is taller than page
  let remaining = imgH;
  let srcY = 0;
  while (remaining > 0) {
    const chunkH = Math.min(remaining, pageH - y - 10);
    const portion = document.createElement('canvas');
    portion.width = canvas.width;
    portion.height = (chunkH / imgW) * canvas.width;
    const ctx = portion.getContext('2d');
    if (ctx) {
      ctx.drawImage(canvas, 0, srcY * (canvas.width / imgW), canvas.width, portion.height, 0, 0, canvas.width, portion.height);
    }
    pdf.addImage(portion.toDataURL('image/png'), 'PNG', 10, y, imgW, chunkH);
    remaining -= chunkH;
    srcY += chunkH;
    y = 10;
    if (remaining > 0) pdf.addPage();
  }

  pdf.save(`castai-roi-${customerName.toLowerCase().replace(/\s+/g, '-')}-${dateStr}.pdf`);
}
