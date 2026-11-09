const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getQuotationBranchDetails } = require('./quotationBranchDetails');

function createPdfBuffer(builder) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
    builder(doc);
    doc.end();
  });
}

async function generateAgreementPdf(agreement) {
  return createPdfBuffer((doc) => {
    doc.rect(0, 0, doc.page.width, 36).fill('#1e293b');
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('NANOSPACE COWORKING AGREEMENT', 40, 12);

    doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold').text(`Agreement Ref: ${agreement.agreement_number || agreement.id}`, 40, 60);
    doc.fontSize(10).font('Helvetica').text(`Date: ${new Date(agreement.start_date || Date.now()).toLocaleDateString('en-IN')}`, 40, 78);
    doc.text(`Status: ${agreement.status || 'ACTIVE'}`, 40, 94);

    doc.rect(40, 115, doc.page.width - 80, 1).fill('#cbd5e1');

    doc.fontSize(11).font('Helvetica-Bold').text('Customer Details', 40, 130);
    doc.fontSize(10).font('Helvetica')
      .text(`Customer: ${agreement.customer_name || 'N/A'}`, 40, 148)
      .text(`Company: ${agreement.company_name || 'Individual'}`, 40, 164)
      .text(`Branch: ${agreement.branch_name || 'N/A'}`, 40, 180);

    doc.fontSize(11).font('Helvetica-Bold').text('Contract Terms & Value', 320, 130);
    doc.fontSize(10).font('Helvetica')
      .text(`Contract Value: INR ${Number(agreement.contract_value || 0).toLocaleString('en-IN')}`, 320, 148)
      .text(`Security Deposit: INR ${Number(agreement.deposit_amount || 0).toLocaleString('en-IN')}`, 320, 164)
      .text(`Valid Until: ${agreement.end_date ? new Date(agreement.end_date).toLocaleDateString('en-IN') : 'Ongoing'}`, 320, 180);

    doc.rect(40, 210, doc.page.width - 80, 1).fill('#cbd5e1');

    doc.fontSize(11).font('Helvetica-Bold').text('Terms and Conditions', 40, 225);
    doc.fontSize(9).font('Helvetica').text(
      agreement.terms ||
      '1. Access to the designated coworking space is granted per NanoSpace facility guidelines.\n' +
      '2. High-speed WiFi, biometric access, and pantry amenities are included as specified.\n' +
      '3. Meeting room credits must be scheduled in advance via the member portal.\n' +
      '4. Payment terms: All monthly fees are due on the 1st of each calendar month.\n' +
      '5. Notice period: 30 days written notice required prior to lease termination.',
      40, 245, { width: doc.page.width - 80, lineGap: 4 }
    );

    doc.fontSize(9).fillColor('#64748b').text('Authorized Signatory: NanoSpace Operations · Hyderabad', 40, 500);
  });
}

async function generateInvoicePdf(invoice) {
  return createPdfBuffer((doc) => {
    const money = (value) => `INR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const date = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
    const left = 40;
    const right = doc.page.width - 40;
    const width = right - left;
    const subtotal = Number(invoice.subtotal || 0);
    const tax = Number(invoice.tax_amount || 0);
    const total = Number(invoice.total_amount || subtotal + tax);
    const advance = Math.min(Number(invoice.advance_amount || invoice.paid_amount || 0), total);
    const balance = Math.max(0, total - advance);

    doc.lineWidth(0.7).rect(left, 38, width, doc.page.height - 78).stroke('#333333');
    doc.rect(left, 38, width, 90).fill('#ffffff');

    doc.fillColor('#ef1c2b').circle(62, 70, 8).fill();
    doc.fillColor('#ffffff').fontSize(6).font('Helvetica-Bold').text('NS', 58, 67, { width: 8, align: 'center' });
    doc.fillColor('#252525').fontSize(7).font('Helvetica-Bold').text('VIJAYA KRISHNA ALLIANCE', 48, 82, { width: 55, align: 'center' });
    doc.fontSize(15).fillColor('#2430a9').text('NANO SPACE', 48, 96, { width: 85, align: 'center', characterSpacing: 1 });
    doc.fontSize(6).fillColor('#252525').font('Helvetica').text('Co-Work Hub', 48, 112, { width: 85, align: 'center' });

    doc.fontSize(7).fillColor('#252525').font('Helvetica-Bold').text('Vijaya Krishna Alliance NanoSpace', 145, 52);
    doc.font('Helvetica').fontSize(6.5)
      .text('Survey 27/4, Floor 3rd, Vijaya Krishna Towers', 145, 64)
      .text('Cachibowli, Nanakramguda Village, Financial District', 145, 74)
      .text('Hyderabad Telangana 500032', 145, 84)
      .text('GSTIN: 36AADFN5615F1ZH', 145, 94)
      .text('Phone: 040-48533386 · www.nanospaceindia.com', 145, 104);

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#252525').text('TAX INVOICE', right - 155, 65, { width: 155, align: 'right' });

    let y = 128;
    doc.rect(left, y, width, 18).fill('#f4f4f4');
    doc.fillColor('#252525').fontSize(7).font('Helvetica-Bold').text(`Invoice No.: ${invoice.invoice_number || invoice.id || '—'}`, left + 6, y + 5);
    doc.text(`Invoice Date: ${date(invoice.issue_date)}`, 330, y + 5);
    doc.text(`Due Date: ${date(invoice.due_date)}`, 455, y + 5);

    y += 18;
    doc.lineWidth(0.5).rect(left, y, width / 2, 78).stroke('#333333').rect(left + width / 2, y, width / 2, 78).stroke('#333333');
    doc.fontSize(7).font('Helvetica-Bold').text('Bill To', left + 6, y + 6);
    doc.font('Helvetica').fontSize(7)
      .text(invoice.customer_name || 'N/A', left + 6, y + 22)
      .text(invoice.company_name || 'Individual', left + 6, y + 34)
      .text(invoice.customer_address || invoice.customer_email || '—', left + 6, y + 46, { width: width / 2 - 12, height: 24 })
      .text(`GSTIN: ${invoice.customer_gstin || '—'}`, left + 6, y + 66);

    doc.font('Helvetica-Bold').text('Ship To / Service Location', left + width / 2 + 6, y + 6);
    doc.font('Helvetica').text(invoice.branch_name || 'NanoSpace', left + width / 2 + 6, y + 22)
      .text(invoice.branch_address || 'Hyderabad, Telangana', left + width / 2 + 6, y + 34, { width: width / 2 - 12, height: 40 });

    y += 78;
    const cols = [left, left + 24, left + 250, left + 320, left + 356, left + 390, left + 434, left + 475, right];
    doc.rect(left, y, width, 24).fill('#eeeeee');
    doc.strokeColor('#333333').lineWidth(0.5).rect(left, y, width, 24).stroke();
    doc.fillColor('#252525').fontSize(6.5).font('Helvetica-Bold');
    ['#', 'Item & Description', 'HSN/SAC', 'Qty', 'Rate', 'GST %', 'Tax', 'Amount'].forEach((label, index) => {
      const start = cols[index];
      if (index > 0) doc.moveTo(start, y).lineTo(start, y + 24).stroke();
      doc.text(label, start + 3, y + 7, { width: index === 1 ? 220 : (cols[index + 1] - start - 5), align: index === 0 ? 'center' : index >= 2 ? 'right' : 'left' });
    });

    y += 24;
    doc.rect(left, y, width, 70).stroke('#333333');
    cols.slice(1, -1).forEach((x) => doc.moveTo(x, y).lineTo(x, y + 70).stroke());
    doc.fillColor('#252525').font('Helvetica').fontSize(6.5);
    doc.text('1', cols[0] + 4, y + 8, { width: 16, align: 'center' });
    doc.text(invoice.notes || 'Coworking space membership and facility services', cols[1] + 5, y + 8, { width: 238 });
    doc.text(invoice.hsn_sac || '9973', cols[2] + 3, y + 8, { width: 64, align: 'right' });
    doc.text('1', cols[3] + 3, y + 8, { width: 32, align: 'right' });
    doc.text(money(subtotal), cols[4] + 3, y + 8, { width: 40, align: 'right' });
    doc.text(`${Number(invoice.tax_percent || (subtotal ? tax / subtotal * 100 : 18)).toFixed(1)}%`, cols[5] + 3, y + 8, { width: 38, align: 'right' });
    doc.text(money(tax), cols[6] + 3, y + 8, { width: 36, align: 'right' });
    doc.text(money(total), cols[7] + 3, y + 8, { width: 40, align: 'right' });

    y += 70;
    doc.rect(left, y, width, 18).stroke('#333333');
    doc.font('Helvetica-Bold').text('Total in words:', left + 5, y + 5);
    doc.font('Helvetica').text('Amount payable as per invoice', left + 82, y + 5);

    y += 18;
    const summaryHeight = 76;
    doc.rect(left + width - 190, y, 190, summaryHeight).stroke('#333333');
    const summaryRows = [
      ['Sub Total', money(subtotal)],
      [`GST (${Number(invoice.tax_percent || (subtotal ? tax / subtotal * 100 : 18)).toFixed(1)}%)`, money(tax)],
      ['Total', money(total)],
      ['Advance / Paid', money(advance)],
      ['Balance Due', money(balance)],
    ];
    doc.fontSize(7);
    summaryRows.forEach((row, index) => {
      const rowY = y + index * 15;
      doc.font(index >= 3 ? 'Helvetica-Bold' : 'Helvetica').fillColor('#252525');
      doc.text(row[0], left + width - 184, rowY + 4, { width: 75 });
      doc.text(row[1], right - 104, rowY + 4, { width: 98, align: 'right' });
      if (index === 2) doc.rect(left + width - 190, rowY, 190, 15).fillAndStroke('#eeeeee', '#333333');
    });

    y += summaryHeight + 10;
    doc.rect(left, y, width / 2, 90).stroke('#333333').rect(left + width / 2, y, width / 2, 90).stroke('#333333');
    doc.fontSize(7).font('Helvetica-Bold').text('Terms & Conditions', left + 6, y + 7);
    doc.font('Helvetica').fontSize(6.5).text(
      '• Account No.: 4545757549\n• Account Name: Vijaya Krishna Alliance\n• IFSC: SBIN0019247\n• All payments must be made by the due date.\n• This invoice is an electronically generated document.',
      left + 6, y + 20, { width: width / 2 - 12, lineGap: 3 }
    );
    doc.font('Helvetica-Bold').fontSize(7).text('Authorized Signatory', right - 112, y + 61, { width: 106, align: 'right' });
    doc.fontSize(6).font('Helvetica').text('NanoSpace Alliance', right - 112, y + 74, { width: 106, align: 'right' });

    doc.fontSize(6).fillColor('#64748b').text('This is a computer generated invoice.', left, doc.page.height - 32, { width, align: 'center' });
  });
}

async function generateQuotationPdf(quotation) {
  return createPdfBuffer((doc) => {
    const money = (value) => `INR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const left = 40;
    const right = doc.page.width - 40;
    const width = right - left;
    const items = Array.isArray(quotation.items) ? quotation.items : [];
    const subtotal = Number(quotation.subtotal || 0);
    const tax = Number(quotation.tax_amount || 0);
    const discount = Number(quotation.discount_amount || 0);
    const total = Number(quotation.total_amount || subtotal + tax - discount);
    const taxRate = Number(quotation.tax_rate ?? 18);
    const taxMode = quotation.tax_mode === 'IGST' ? 'IGST' : 'CGST_SGST';
    const branchDetails = getQuotationBranchDetails(quotation.branch_name || quotation.branch);
    const terms = [
      'Facilities and amenities are as described in this quotation and selected plan.',
      "Security deposit: two months' rent; one month's advance rent.",
      'Payments made are non-refundable.',
      'A two-month notice period applies to termination.',
      'Operating hours: 9:00 AM-6:00 PM.',
      'One shift, with a maximum of 10 hours per day.',
      'This quotation is valid until the expiry date shown above.',
      'Applicable government taxes will be charged in addition to the quoted amounts.',
      'Late payment penalty: 2% monthly.',
      'KYC documents are required before onboarding.',
      'The customer is responsible for property damage.',
      'NanoSpace is not liable for loss of or damage to personal belongings.',
      'Guest visits are limited to 45 minutes.',
      'Network use must follow NanoSpace policies and applicable law.',
    ];
    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const twoDigits = (number) => number < 20 ? units[number] : `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${units[number % 10]}` : ''}`;
    const threeDigits = (number) => number < 100 ? twoDigits(number) : `${units[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${twoDigits(number % 100)}` : ''}`;
    const amountWords = (amount) => {
      let rupees = Math.floor(Number(amount) || 0);
      let words = '';
      for (const [place, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']]) {
        if (rupees >= place) {
          const count = Math.floor(rupees / place);
          words += `${words ? ' ' : ''}${place === 100 ? threeDigits(count) : `${twoDigits(count)} ${label}`}`;
          rupees %= place;
        }
      }
      if (rupees) words += `${words ? ' ' : ''}${twoDigits(rupees)}`;
      const paise = Math.round(((Number(amount) || 0) % 1) * 100);
      return `Indian Rupees ${words || 'Zero'}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
    };
    const logoPath = path.join(__dirname, '../../logo.png');
    const ink = '#1c2b3d';
    const navy = '#18304e';
    const muted = '#64748b';
    const pale = '#f4f7fb';
    const accent = '#1c748e';
    const drawPage = (continuation = false) => {
      doc.rect(left, 32, width, 4).fill(accent);
      if (fs.existsSync(logoPath)) doc.image(logoPath, left + 4, 45, { fit: [92, 54] });
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(10).text(branchDetails.headerName, left + 112, 47, { width: 225 });
      doc.font('Helvetica-Bold').fontSize(8).text('NanoSpace Co-Working', left + 112, 62);
      doc.font('Helvetica').fontSize(7).fillColor(muted);
      doc.text(branchDetails.address, left + 112, 76, { width: 225 });
      const addressHeight = doc.heightOfString(branchDetails.address, { width: 225 });
      let contactY = 76 + addressHeight + 3;
      if (branchDetails.isHeadOffice) {
        doc.text('GSTIN  36AADPN8265F1ZJ', left + 112, contactY);
        contactY += 12;
      }
      const branchContact = [branchDetails.phone, branchDetails.email].filter(Boolean).join('  ·  ');
      if (branchContact) {
        doc.text(branchContact, left + 112, contactY);
        contactY += 12;
      }
      if (branchDetails.isHeadOffice) {
        doc.text('www.nanospaceindia.com', left + 112, contactY);
      }
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(14)
        .text(continuation ? 'QUOTATION - CONTINUED' : 'QUOTATION', right - 230, 52, { width: 218, align: 'right' });
      doc.fillColor(accent).fontSize(10)
        .text(quotation.quotation_number || quotation.id || 'QT-01', right - 230, 76, { width: 218, align: 'right' });
      return 135;
    };
    const date = (value) => value
      ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
      : '-';
    let y = drawPage();
    doc.rect(left, y, width, 34).fill(pale);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(7)
      .text('PLACE OF SUPPLY', left + 12, y + 8)
      .text('QUOTE DATE', left + 190, y + 8)
      .text('VALID UNTIL', left + 360, y + 8);
    doc.font('Helvetica').fontSize(9).fillColor(ink)
      .text('Telangana (36)', left + 12, y + 20)
      .text(date(quotation.created_at || Date.now()), left + 190, y + 20)
      .text(date(quotation.valid_until), left + 360, y + 20);
    doc.moveTo(left + 174, y + 5).lineTo(left + 174, y + 29).stroke('#d7e0eb');
    doc.moveTo(left + 344, y + 5).lineTo(left + 344, y + 29).stroke('#d7e0eb');
    y += 40;

    const cardWidth = (width - 12) / 2;
    const cardY = y;
    doc.rect(left, cardY, cardWidth, 86).fill('#fafbfd');
    doc.rect(left, cardY, cardWidth, 3).fill(accent);
    doc.rect(left + cardWidth + 12, cardY, cardWidth, 86).fill('#fafbfd');
    doc.rect(left + cardWidth + 12, cardY, cardWidth, 3).fill(accent);
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(7).text('PREPARED FOR', left + 10, cardY + 13);
    doc.fillColor(ink).fontSize(11).text(quotation.customer_name || quotation.customer || 'N/A', left + 10, cardY + 27, { width: cardWidth - 20 });
    doc.font('Helvetica').fontSize(8).fillColor(muted)
      .text(quotation.company_name || 'Individual', left + 10, cardY + 43, { width: cardWidth - 20 })
      .text(quotation.customer_address || 'Address not provided', left + 10, cardY + 54, { width: cardWidth - 20, height: 10, ellipsis: true })
      .text(`${[quotation.customer_email, quotation.customer_phone].filter(Boolean).join('  |  ') || 'Contact not provided'}  |  GSTIN ${quotation.customer_gstin || '—'}`, left + 10, cardY + 67, { width: cardWidth - 20, height: 10, ellipsis: true });
    const locationX = left + cardWidth + 22;
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(7).text('SELECTED BRANCH / SERVICE LOCATION', locationX, cardY + 13);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(10)
      .text(branchDetails.name, locationX, cardY + 27, { width: cardWidth - 20 });
    doc.font('Helvetica').fontSize(7.5).fillColor(muted)
      .text(branchDetails.address, locationX, cardY + 41, { width: cardWidth - 20, height: 20, ellipsis: true });
    const branchContacts = [branchDetails.phone, branchDetails.email].filter(Boolean).join('  |  ');
    if (branchContacts) {
      doc.fontSize(7).fillColor(ink).text(branchContacts, locationX, cardY + 64, { width: cardWidth - 20, height: 10, ellipsis: true });
    }
    y += 86;
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(10).text('QUOTATION DETAILS', left, y);
    doc.fillColor(muted).font('Helvetica').fontSize(8)
      .text(`${items.length} ${items.length === 1 ? 'item' : 'items'}  |  ${taxMode === 'IGST' ? `IGST ${taxRate}%` : `GST ${taxRate}%`}`, right - 220, y + 1, { width: 220, align: 'right' });
    y += 12;

    const columns = [left, left + 26, left + 236, left + 292, left + 334, left + 404, left + 454, right];
    const drawTableHeader = () => {
      doc.rect(left, y, width, 26).fill(navy);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
      const labels = ['#', 'ITEM / DESCRIPTION', 'SAC', 'QTY', 'RATE (INR)', taxMode === 'IGST' ? 'IGST' : 'GST', 'AMOUNT (INR)'];
      labels.forEach((label, index) => {
        const x = index === 1 ? columns[index] + 8 : columns[index] + 3;
        const textWidth = columns[index + 1] - columns[index] - (index === 1 ? 12 : 6);
        doc.text(label, x, y + 10, { width: textWidth, align: index === 1 ? 'left' : index < 4 ? 'center' : 'right' });
      });
      y += 26;
    };
    drawTableHeader();
    items.forEach((item, index) => {
      const description = String(item.name || item.description || 'Workspace service');
      const detail = item.description && item.name ? String(item.description) : '';
      doc.font('Helvetica').fontSize(8);
      const nameLines = doc.heightOfString(description, { width: columns[2] - columns[1] - 16 });
      const detailLines = detail ? doc.heightOfString(detail, { width: columns[2] - columns[1] - 16 }) : 0;
      const rowHeight = Math.max(26, nameLines + detailLines + (detail ? 8 : 12));
      if (y + rowHeight > 570) {
        doc.addPage();
        y = drawPage(true);
        drawTableHeader();
      }
      if (index % 2 === 0) doc.rect(left, y, width, rowHeight).fill('#f7f9fc');
      doc.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).stroke('#d7e0eb');
      const rate = Number(item.unitRate ?? item.rate ?? 0);
      const quantity = Number(item.quantity ?? item.qty ?? 1);
      const lineSubtotal = Number(item.subtotal ?? item.lineTotal ?? rate * quantity);
      const lineTax = Number(item.taxAmount ?? (lineSubtotal * taxRate / 100).toFixed(2));
      const lineTotal = Number(item.total ?? (lineSubtotal + lineTax).toFixed(2));
      const middle = y + rowHeight / 2 - 4;
      doc.fillColor(ink).font('Helvetica').fontSize(8)
        .text(String(index + 1), columns[0] + 3, middle, { width: columns[1] - columns[0] - 6, align: 'center' })
        .font('Helvetica-Bold').fontSize(8.5)
        .text(description, columns[1] + 8, y + 7, { width: columns[2] - columns[1] - 16, height: detail ? 13 : rowHeight - 8, ellipsis: true })
        .font('Helvetica').fontSize(7.5).fillColor(muted);
      if (detail) doc.text(detail, columns[1] + 8, y + 20, { width: columns[2] - columns[1] - 16, height: rowHeight - 20, ellipsis: true });
      doc.fillColor(ink).font('Helvetica').fontSize(8)
        .text(item.hsn_sac || item.hsn || '-', columns[2] + 2, middle, { width: columns[3] - columns[2] - 5, align: 'center' })
        .text(String(quantity), columns[3] + 2, middle, { width: columns[4] - columns[3] - 5, align: 'center' })
        .text(money(rate), columns[4] + 2, middle, { width: columns[5] - columns[4] - 5, align: 'right' })
        .text(`${taxRate}%`, columns[5] + 2, middle, { width: columns[6] - columns[5] - 5, align: 'right' })
        .font('Helvetica-Bold').text(money(lineTotal), columns[6] + 2, middle, { width: columns[7] - columns[6] - 6, align: 'right' });
      y += rowHeight;
    });

    const totals = [
      ['Subtotal', subtotal],
      ['Discount', -discount],
      ...(taxMode === 'IGST'
        ? [[`IGST (${taxRate}%)`, tax]]
        : [[`CGST (${taxRate / 2}%)`, Number((tax / 2).toFixed(2))], [`SGST (${taxRate / 2}%)`, Number((tax - tax / 2).toFixed(2))]]),
      ['Grand Total', total],
    ];
    const summaryHeight = 66;
    if (y + summaryHeight + 190 > 760) {
      doc.addPage();
      y = drawPage(true);
    }
    y += 12;
    const summaryX = left + 306;
    doc.rect(left, y, 290, summaryHeight).fill(pale);
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(7).text('AMOUNT IN WORDS', left + 12, y + 15);
    doc.fillColor(ink).font('Helvetica').fontSize(9)
      .text(amountWords(total), left + 12, y + 31, { width: 262, lineGap: 3 });
    doc.rect(summaryX, y, right - summaryX, summaryHeight).fill('#fafbfd');
    totals.forEach(([label, amount], index) => {
      const rowY = y + 12 + index * 12;
      if (index === totals.length - 1) doc.rect(summaryX + 6, rowY - 4, right - summaryX - 12, 17).fill('#e0edfa');
      doc.fillColor(index === totals.length - 1 ? navy : ink)
        .font(index === totals.length - 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
        .text(label, summaryX + 12, rowY, { width: 115 })
        .text(money(amount), right - 12 - 105, rowY, { width: 105, align: 'right' });
    });
    y += summaryHeight + 8;
    if (quotation.notes) {
      const noteLines = doc.heightOfString(String(quotation.notes), { width, font: 'Helvetica', fontSize: 8 });
      if (y + noteLines + 160 > 760) {
        doc.addPage();
        y = drawPage(true);
      }
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(8).text('Note', left, y);
      doc.font('Helvetica').fontSize(8).fillColor(muted).text(quotation.notes, left + 36, y, { width: width - 36 });
      y += noteLines + 13;
    }

    const termColumns = [terms.slice(0, 7), terms.slice(7)];
    const termFontSize = 7.2;
    const termColumnWidth = (width - 30) / 2;
    const measuredTerms = termColumns.map((column, columnIndex) => column.map((term, index) => ({
      number: columnIndex * 7 + index + 1,
      text: term,
      height: Math.max(12, doc.heightOfString(term, { width: termColumnWidth - 18, font: 'Helvetica', fontSize: termFontSize }) + 2),
    })));
    const termBodyHeight = Math.max(...measuredTerms.map((column) => column.reduce((sum, item) => sum + item.height, 0)));
    const termSectionHeight = 28 + termBodyHeight + 7;
    if (y + termSectionHeight + 65 > 760) {
      doc.addPage();
      y = drawPage(true);
    }
    doc.rect(left, y, width, termSectionHeight).fill('#fafbfd');
    doc.rect(left, y, width, 22).fill(navy);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5).text('TERMS & CONDITIONS', left + 12, y + 7);
    doc.fillColor('#dbeafe').font('Helvetica').fontSize(6.5)
      .text('Please review before confirming', right - 220, y + 8, { width: 208, align: 'right' });
    doc.moveTo(left + width / 2, y + 26).lineTo(left + width / 2, y + termSectionHeight - 5).stroke('#d7e0eb');
    measuredTerms.forEach((column, columnIndex) => {
      let termY = y + 34;
      column.forEach((item) => {
        const columnX = columnIndex === 0 ? left + 10 : left + width / 2 + 10;
        doc.fillColor(accent).font('Helvetica-Bold').fontSize(7.5).text(`${item.number}.`, columnX, termY);
        doc.fillColor(ink).font('Helvetica').fontSize(termFontSize)
          .text(item.text, columnX + 17, termY, { width: termColumnWidth - 19 });
        termY += item.height;
      });
    });
    y += termSectionHeight + 22;
    doc.moveTo(right - 170, y).lineTo(right, y).stroke('#64748b');
    doc.fillColor(ink).font('Helvetica').fontSize(7.5)
      .text(`For ${branchDetails.headerName}`, right - 230, y + 8, { width: 230, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(8).text('Authorized Signatory', right - 230, y + 23, { width: 230, align: 'right' });
    doc.font('Helvetica').fontSize(7).fillColor(muted)
      .text('Thank you for choosing NanoSpace Co-Working.', left, doc.page.height - 60, { width, align: 'center' });
  });
}

async function generatePayslipPdf(payroll) {
  return createPdfBuffer((doc) => {
    doc.rect(0, 0, doc.page.width, 36).fill('#0f766e');
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('NANOSPACE SALARY PAYSLIP', 40, 12);

    doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold').text(`Pay Period: ${payroll.pay_period}`, 40, 60);
    doc.fontSize(10).font('Helvetica')
      .text(`Employee: ${payroll.employee_name || payroll.full_name || 'N/A'}`, 40, 78)
      .text(`Designation: ${payroll.role || 'Employee'}`, 40, 94)
      .text(`Branch: ${payroll.branch_name || 'N/A'}`, 40, 110);

    doc.rect(40, 130, doc.page.width - 80, 1).fill('#cbd5e1');

    doc.rect(40, 145, doc.page.width - 80, 20).fill('#f1f5f9');
    doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold')
      .text('Earnings', 50, 151)
      .text('Amount (INR)', 220, 151)
      .text('Deductions', 330, 151)
      .text('Amount (INR)', doc.page.width - 120, 151);

    const basic = Number(payroll.basic_salary || 0);
    const allowances = Number(payroll.allowances || 0);
    const deductions = Number(payroll.deductions || 0);
    const net = Number(payroll.net_salary || (basic + allowances - deductions));

    doc.font('Helvetica').fontSize(9)
      .text('Basic Salary', 50, 175).text(`INR ${basic.toLocaleString('en-IN')}`, 220, 175)
      .text('Provident Fund & Taxes', 330, 175).text(`INR ${deductions.toLocaleString('en-IN')}`, doc.page.width - 120, 175)
      .text('HRA & Allowances', 50, 195).text(`INR ${allowances.toLocaleString('en-IN')}`, 220, 195);

    doc.rect(40, 230, doc.page.width - 80, 1).fill('#cbd5e1');

    doc.font('Helvetica-Bold').fontSize(12)
      .text('Net Salary Paid:', 50, 245)
      .text(`INR ${net.toLocaleString('en-IN')}`, doc.page.width - 150, 245);

    doc.fontSize(9).font('Helvetica').fillColor('#64748b')
      .text(`Status: ${payroll.status || 'COMPLETED'} · Payment Date: ${payroll.pay_date ? new Date(payroll.pay_date).toLocaleDateString('en-IN') : 'Processed'}`, 40, 280);
  });
}

async function generateReceiptPdf(payment) {
  return createPdfBuffer((doc) => {
    doc.rect(0, 0, doc.page.width, 36).fill('#15803d');
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('NANOSPACE PAYMENT RECEIPT', 40, 12);

    doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold').text(`Receipt Ref: ${payment.payment_number || payment.id}`, 40, 60);
    doc.fontSize(10).font('Helvetica')
      .text(`Date: ${new Date(payment.payment_date || payment.due_date || Date.now()).toLocaleDateString('en-IN')}`, 40, 78)
      .text(`Payer: ${payment.customer_name || 'Client'}`, 40, 94)
      .text(`Branch: ${payment.branch_name || 'N/A'}`, 40, 110);

    doc.rect(40, 130, doc.page.width - 80, 1).fill('#cbd5e1');

    doc.fontSize(11).font('Helvetica-Bold').text('Payment Particulars', 40, 145);
    doc.fontSize(10).font('Helvetica')
      .text(`Amount Received: INR ${Number(payment.amount || 0).toLocaleString('en-IN')}`, 40, 165)
      .text(`Payment Mode: ${payment.payment_method || 'UPI'}`, 40, 182)
      .text(`Transaction Status: ${payment.status || 'COMPLETED'}`, 40, 199)
      .text(`Invoice Reference: ${payment.invoice_number || 'INV-DIRECT'}`, 40, 216);

    doc.rect(40, 245, doc.page.width - 80, 1).fill('#cbd5e1');
    doc.fontSize(9).font('Helvetica').fillColor('#64748b')
      .text('This is an electronically generated receipt issued by NanoSpace Coworking.', 40, 265);
  });
}

module.exports = {
  generateAgreementPdf,
  generateInvoicePdf,
  generateQuotationPdf,
  generatePayslipPdf, 
  generateReceiptPdf,
};
