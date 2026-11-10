import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Alert, Badge, Button, Card, CardBody, Col, FormGroup, Input, Label, Row } from 'reactstrap';
import { FiDownload, FiFileText, FiMail, FiPlus, FiSearch, FiTrash2, FiUserCheck } from 'react-icons/fi';
import { SiWhatsapp } from 'react-icons/si';
import { useDispatch, useSelector } from 'react-redux';
import { demoCustomers } from '../../data/inventory';
import { getQuotationBranchDetails, getQuotationNumberPrefix } from '../../data/quotationBranchDetails';
import { addQuotation } from '../../store/slices/workspaceSlice';
import { hydrateInventory } from '../../store/slices/inventorySlice';
import { showSuccess, showError } from '../../utils/toast';
import {
  api,
  getApiCollection,
  getApiErrorMessage,
  getApiPayload,
  isApiEnabled,
  normalizeApiCustomer,
  normalizeInventoryItem,
} from '../../services/api';

const SelectableDataTable = dynamic(() => import('react-data-table-component'), { ssr: false });
const company = {
  name: 'Vijaya Krishna Alliance Nanospace',
  brand: 'NanoSpace Co-Working',
  address: 'Survey 27/4, Floor #9, Vijaya Krishna Towers, Gachibowli, Nanakramguda Village, Financial District, Hyderabad, Telangana 500032, India',
  gstin: '36AADPN8265F1ZJ',
  phone: '9966585958',
  email: 'admin@nanospaceindia.com',
  website: 'www.nanospaceindia.com',
  placeOfSupply: 'Telangana (36)',
};

const terms = [
  'Facilities and amenities are as described in this quotation and selected plan.',
  'Security deposit: two months’ rent; one month’s advance rent.',
  'Payments made are non-refundable.',
  'A two-month notice period applies to termination.',
  'Operating hours: 9:00 AM–6:00 PM.',
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

const money = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

function getNextQuotationNumber(quotations, branch) {
  const prefix = getQuotationNumberPrefix(branch);
  const numberPattern = new RegExp(`^${prefix}-QT-(\\d+)$`, 'i');
  const maximum = (Array.isArray(quotations) ? quotations : []).reduce((currentMax, quotation) => {
    const match = String(quotation.quotation_number || quotation.id || '').match(numberPattern);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `${prefix}-QT-${String(maximum + 1).padStart(2, '0')}`;
}

function amountInWords(value) {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigits = (number) => number < 20
    ? units[number]
    : `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${units[number % 10]}` : ''}`;
  const threeDigits = (number) => number < 100
    ? twoDigits(number)
    : `${units[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${twoDigits(number % 100)}` : ''}`;
  let rupees = Math.floor(Number(value) || 0);
  let words = '';
  for (const [place, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']]) {
    if (rupees >= place) {
      const count = Math.floor(rupees / place);
      words += `${words ? ' ' : ''}${place === 100 ? threeDigits(count) : `${twoDigits(count)} ${label}`}`;
      rupees %= place;
    }
  }
  if (rupees) words += `${words ? ' ' : ''}${twoDigits(rupees)}`;
  const paise = Math.round(((Number(value) || 0) % 1) * 100);
  return `Indian Rupees ${words || 'Zero'}${paise ? ` and ${twoDigits(paise)} Paise` : ''} Only`;
}

const columns = [
  { name: 'Item', selector: (row) => row.name, sortable: true, wrap: true, grow: 2 },
  { name: 'Item ID', selector: (row) => row.id, sortable: true, wrap: true },
  { name: 'Rate', selector: (row) => money(row.rate), sortable: true, right: true },
  { name: 'Unit', selector: (row) => row.unit, sortable: true },
  { name: 'Status', cell: (row) => <Badge color="success" pill>{row.status}</Badge> },
];

export default function QuotationBuilder({ user, onSaved }) {
  const dispatch = useDispatch();
  const inventory = useSelector((state) => state.inventory);
  const savedQuotations = useSelector((state) => state.workspace.quotations);
  const [apiCustomers, setApiCustomers] = useState([]);
  const [apiQuotations, setApiQuotations] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [branch, setBranch] = useState(user.branch || 'Nanakramguda');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(18);
  const [taxMode, setTaxMode] = useState('CGST_SGST');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState('');
  const [apiBusy, setApiBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [savedQuoteNumber, setSavedQuoteNumber] = useState(null);

  const customers = isApiEnabled ? apiCustomers : demoCustomers;
  const quotationHistory = isApiEnabled ? apiQuotations : savedQuotations;
  const quoteNumber = savedQuoteNumber || getNextQuotationNumber(quotationHistory, branch);
  const selectedBranchDetails = getQuotationBranchDetails(branch);
  const customer = customers.find((entry) => (entry.id || entry._id || entry.email) === customerId);
  const customerOptions = user.role === 'super_admin'
    ? customers
    : customers.filter((entry) => (entry.branch?.name || entry.branch) === (user.branch || branch));
  const filteredInventory = inventory.filter((item) =>
    item.status === 'Active' && `${item.name} ${item.id} ${item.description}`.toLowerCase().includes(search.toLowerCase())
  );
  const lines = selected.map((item) => {
    const quantity = Math.max(1, Number(quantities[item.id] || 1));
    return { ...item, quantity, lineTotal: Number((Number(item.rate) * quantity).toFixed(2)) };
  });
  const subtotal = Number(lines.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
  const discountAmount = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const parsedTaxRate = Math.max(0, Math.min(100, Number(taxRate) || 0));
  const taxAmount = Number((taxableAmount * parsedTaxRate / 100).toFixed(2));
  const total = Number((taxableAmount + taxAmount).toFixed(2));
  const quotationSaved = Boolean(savedQuoteNumber);

  const invalidateSavedQuotation = () => {
    if (!savedQuoteNumber) return;
    setSavedQuoteNumber(null);
    setNotice(`Quotation ${savedQuoteNumber} remains saved. Save again to create a quotation for the updated details.`);
  };

  useEffect(() => {
    if (!isApiEnabled) return undefined;
    let active = true;
    Promise.all([api.inventory.list(), api.customers.list(), api.quotations.list()])
      .then(([inventoryResponse, customerResponse, quotationsResponse]) => {
        if (!active) return;
        dispatch(hydrateInventory(getApiCollection(inventoryResponse).map(normalizeInventoryItem)));
        setApiCustomers(getApiCollection(customerResponse).map(normalizeApiCustomer));
        setApiQuotations(getApiCollection(quotationsResponse));
      })
      .catch((error) => {
        console.error('Could not load quotation data:', error);
        if (active) setNotice(getApiErrorMessage(error, 'Quotation data could not be loaded.'));
      });
    return () => { active = false; };
  }, [dispatch]);

  const saveDraft = async () => {
    if (!customer) {
      setNotice('Please select a customer before saving the quotation.');
      return null;
    }
    if (!lines.length) {
      setNotice('Select at least one inventory item.');
      return null;
    }
    const quotation = {
      id: quoteNumber,
      quotation_number: quoteNumber,
      customer: customer.name,
      customerId: customer.id || customer._id || customer.email,
      branch,
      date: new Date().toISOString(),
      amount: total,
      status: 'Draft',
      items: lines.map((item) => ({
        id: item.id,
        inventoryItemId: item.id,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        rate: item.rate,
        unit: item.unit,
        total: item.lineTotal,
      })),
      subtotal,
      discount: discountAmount,
      tax: taxAmount,
      taxRate: parsedTaxRate,
      taxMode,
      validUntil,
      notes,
    };

    setApiBusy(true);
    try {
      if (isApiEnabled) {
        const response = await api.quotations.create(quotation);
        const record = getApiPayload(response);
        const assignedNumber = record?.quotation_number;
        if (!assignedNumber) throw new Error('The saved quotation did not include its quotation number.');
        setSavedQuoteNumber(assignedNumber);
        setApiQuotations((current) => [record, ...current]);
        setNotice(`Quotation ${assignedNumber} saved successfully.`);
        showSuccess(`Quotation ${assignedNumber} saved successfully.`);
        onSaved?.();
        return assignedNumber;
      }

      dispatch(addQuotation(quotation));
      setSavedQuoteNumber(quoteNumber);
      setNotice(`Quotation ${quoteNumber} saved to local records.`);
      showSuccess(`Quotation ${quoteNumber} saved successfully.`);
      return quoteNumber;
    } catch (error) {
      console.error('Could not save quotation:', error);
      const message = getApiErrorMessage(error, 'Quotation could not be saved.');
      setNotice(message);
      showError(message);
      return null;
    } finally {
      setApiBusy(false);
    }
  };

  const generatePdf = async () => {
    if (!customer) {
      setNotice('Please select a customer before generating the quotation.');
      return null;
    }
    if (!lines.length) {
      setNotice('Select at least one inventory item.');
      return null;
    }
    setPdfBusy(true);
    try {
      const assignedNumber = quotationSaved ? quoteNumber : await saveDraft();
      if (!assignedNumber) return null;
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const formatAmount = (value) => new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value) || 0);
      const formatDate = (value) => value
        ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—';
      const line = (x1, y1, x2, y2) => {
        doc.setDrawColor(205, 215, 227);
        doc.setLineWidth(0.22);
        doc.line(x1, y1, x2, y2);
      };
      const fillBox = (x, y, width, height, color) => {
        doc.setFillColor(...color);
        doc.rect(x, y, width, height, 'F');
      };
      const write = (value, x, y, size = 6, font = 'normal', align) => {
        doc.setFont('helvetica', font);
        doc.setFontSize(size);
        doc.setTextColor(35, 35, 35);
        doc.text(String(value ?? ''), x, y, align ? { align } : {});
      };
      const logoResponse = await fetch('/logo.png');
      if (!logoResponse.ok) throw new Error('The NanoSpace quotation logo could not be loaded.');
      const logoBlob = await logoResponse.blob();
      const logo = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(logoBlob);
      });
      const ink = [28, 43, 61];
      const navy = [24, 48, 78];
      const muted = [101, 116, 139];
      const pale = [244, 247, 251];
      const accent = [28, 116, 142];
      const pageLeft = 12;
      const pageRight = 198;
      const contentWidth = pageRight - pageLeft;
      const contentBottom = 278;
      const startPage = (continuation = false) => {
        fillBox(pageLeft, 12, contentWidth, 1.5, accent);
        doc.addImage(logo, 'PNG', pageLeft, 17, 33, 19);
        write(selectedBranchDetails.headerName, 50, 20, 9, 'bold');
        write(company.brand, 50, 26, 7, 'bold');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.1);
        doc.setTextColor(...muted);
        doc.text(doc.splitTextToSize(selectedBranchDetails.address, 91), 50, 31);
        if (selectedBranchDetails.isHeadOffice) {
          write(`GSTIN  ${company.gstin}`, 50, 40, 6.2, 'bold');
        }
        const headerContact = [selectedBranchDetails.phone, selectedBranchDetails.email].filter(Boolean).join('  ·  ');
        if (headerContact) write(headerContact, 50, 45, 6.2);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...navy);
        doc.text(continuation ? 'QUOTATION · CONTINUED' : 'QUOTATION', 198, 23, { align: 'right' });
        doc.setFontSize(8);
        doc.setTextColor(...accent);
        doc.text(assignedNumber, 198, 31, { align: 'right' });

        fillBox(pageLeft, 51, contentWidth, 12, pale);
        write('PLACE OF SUPPLY', 16, 56, 5.2, 'bold');
        write(company.placeOfSupply, 16, 60, 6.5, 'normal');
        line(73, 53, 73, 61);
        write('QUOTE DATE', 79, 56, 5.2, 'bold');
        write(new Date().toLocaleDateString('en-IN'), 79, 60, 6.5);
        line(127, 53, 127, 61);
        write('VALID UNTIL', 133, 56, 5.2, 'bold');
        write(validUntil ? formatDate(validUntil) : 'As agreed', 133, 60, 6.5);
        return continuation ? 70 : 68;
      };
      let y = startPage();
      fillBox(pageLeft, y, contentWidth / 2 - 2, 38, [250, 251, 253]);
      fillBox(pageLeft + contentWidth / 2 + 2, y, contentWidth / 2 - 2, 38, [250, 251, 253]);
      doc.setFillColor(...accent);
      doc.rect(pageLeft, y, contentWidth / 2 - 2, 1, 'F');
      doc.rect(pageLeft + contentWidth / 2 + 2, y, contentWidth / 2 - 2, 1, 'F');
      write('PREPARED FOR', pageLeft + 4, y + 6, 5.2, 'bold');
      write(customer.name, pageLeft + 4, y + 12, 8, 'bold');
      const customerMeta = [
        customer.company,
        customer.address || customer.address_line || customer.customer_address,
        [customer.email, customer.phone].filter(Boolean).join('  ·  '),
        customer.gstin ? `GSTIN  ${customer.gstin}` : '',
      ].filter(Boolean);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(...muted);
      doc.text(doc.splitTextToSize(customerMeta.join('  ·  '), contentWidth / 2 - 12).slice(0, 2), pageLeft + 4, y + 18);
      write('SELECTED BRANCH / SERVICE LOCATION', pageLeft + contentWidth / 2 + 6, y + 6, 5.2, 'bold');
      write(selectedBranchDetails.name, pageLeft + contentWidth / 2 + 6, y + 13, 7.2, 'bold');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(...muted);
      const branchContact = [selectedBranchDetails.phone, selectedBranchDetails.email].filter(Boolean).join('  ·  ');
      doc.text(doc.splitTextToSize(selectedBranchDetails.address, contentWidth / 2 - 12), pageLeft + contentWidth / 2 + 6, y + 19);
      if (branchContact) {
        doc.setFontSize(5.2);
        doc.text(doc.splitTextToSize(branchContact, contentWidth / 2 - 12), pageLeft + contentWidth / 2 + 6, y + 29);
      }
      y += 42;
      write('QUOTATION DETAILS', pageLeft, y, 7.5, 'bold');
      write(`${lines.length} ${lines.length === 1 ? 'item' : 'items'}  ·  ${taxMode === 'IGST' ? `IGST ${parsedTaxRate}%` : `GST ${parsedTaxRate}%`}`, pageRight, y, 6, 'normal', 'right');
      y += 4;
      const columnsX = [12, 21, 91, 110, 124, 149, 169, 198];
      const drawTableHeader = (headerY) => {
        fillBox(pageLeft, headerY, contentWidth, 9, navy);
        const headings = ['#', 'ITEM / DESCRIPTION', 'SAC', 'QTY', 'RATE (INR)', taxMode === 'IGST' ? 'IGST' : 'GST', 'AMOUNT (INR)'];
        headings.forEach((heading, index) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.8);
          doc.setTextColor(255, 255, 255);
          const align = index === 1 ? 'left' : index < 4 ? 'center' : 'right';
          const x = index === 1 ? columnsX[index] + 3 : (columnsX[index] + columnsX[index + 1]) / 2;
          doc.text(heading, x, headerY + 5.8, { align });
        });
      };
      drawTableHeader(y);
      y += 9;
      const taxableRatio = subtotal ? taxableAmount / subtotal : 0;
      let accruedTax = 0;
      let allocatedTax = 0;
      const itemTaxes = lines.map((item) => {
        accruedTax += item.lineTotal * taxableRatio * parsedTaxRate / 100;
        const roundedTax = Number(accruedTax.toFixed(2));
        const lineTax = Number((roundedTax - allocatedTax).toFixed(2));
        allocatedTax = roundedTax;
        return lineTax;
      });
      lines.forEach((item, index) => {
        const description = doc.splitTextToSize(item.description || item.name, 66).slice(0, 2);
        const rowHeight = Math.max(10, description.length * 3.2 + 3);
        if (y + rowHeight > contentBottom) {
          doc.addPage();
          y = startPage(true);
          drawTableHeader(y);
          y += 9;
        }
        if (index % 2 === 0) fillBox(pageLeft, y, contentWidth, rowHeight, pale);
        line(pageLeft, y + rowHeight, pageRight, y + rowHeight);
        const centerY = y + rowHeight / 2 + 1.2;
        write(index + 1, (columnsX[0] + columnsX[1]) / 2, centerY, 6.5, 'normal', 'center');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(...ink);
        doc.text(description, columnsX[1] + 3, y + 5);
        write(item.hsn_sac || item.hsn || '—', (columnsX[2] + columnsX[3]) / 2, centerY, 6.1, 'normal', 'center');
        write(item.quantity, (columnsX[3] + columnsX[4]) / 2, centerY, 6.5, 'normal', 'center');
        write(formatAmount(item.rate), columnsX[5] - 3, centerY, 6.1, 'normal', 'right');
        write(`${parsedTaxRate}%`, columnsX[6] - 3, centerY, 6.1, 'normal', 'right');
        write(formatAmount(item.lineTotal + itemTaxes[index]), pageRight - 3, centerY, 6.2, 'bold', 'right');
        y += rowHeight;
      });

      if (y + 53 > contentBottom) {
        doc.addPage();
        y = startPage(true);
      }
      y += 5;
      fillBox(pageLeft, y, 98, 36, pale);
      write('AMOUNT IN WORDS', pageLeft + 5, y + 7, 5.5, 'bold');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...ink);
      doc.text(doc.splitTextToSize(amountInWords(total), 88).slice(0, 3), pageLeft + 5, y + 15);
      const totals = [
        ['Subtotal', subtotal],
        ['Discount', -discountAmount],
        ...(taxMode === 'IGST'
          ? [[`IGST (${parsedTaxRate}%)`, taxAmount]]
          : [[`CGST (${parsedTaxRate / 2}%)`, Number((taxAmount / 2).toFixed(2))], [`SGST (${parsedTaxRate / 2}%)`, Number((taxAmount - taxAmount / 2).toFixed(2))]]),
        ['Grand Total', total],
      ];
      totals.forEach(([label, amount], index) => {
        const rowY = y + 5 + index * 6;
        if (label === 'Grand Total') fillBox(114, rowY - 4, 84, 8, [224, 237, 250]);
        write(label, 117, rowY, 6.3, label === 'Grand Total' ? 'bold' : 'normal');
        write(`INR ${formatAmount(amount)}`, 195, rowY, 6.3, label === 'Grand Total' ? 'bold' : 'normal', 'right');
      });
      y += 41;
      if (notes) {
        write(`NOTE  ${notes}`, pageLeft, y + 2, 6, 'normal');
        y += 7;
      }

      const termColumns = [terms.slice(0, 7), terms.slice(7)];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      const termRows = termColumns.map((columnTerms) => columnTerms.map((term, index) => ({
        text: `${index + (columnTerms === termColumns[0] ? 1 : 8)}. ${term}`,
        lines: doc.splitTextToSize(`${index + (columnTerms === termColumns[0] ? 1 : 8)}. ${term}`, 85),
      })));
      const termRowHeights = Array.from({ length: 7 }, (_, index) =>
        Math.max(...termRows.map((column) => column[index].lines.length * 3.4 + 1.2))
      );
      const termsHeight = 9 + termRowHeights.reduce((sum, height) => sum + height, 0) + 4;
      if (y + termsHeight + 18 > contentBottom) {
        doc.addPage();
        y = startPage(true);
      }
      fillBox(pageLeft, y, contentWidth, termsHeight, [250, 251, 253]);
      fillBox(pageLeft, y, contentWidth, 8, navy);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.text('TERMS & CONDITIONS', pageLeft + 4, y + 5.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.4);
      doc.setTextColor(219, 234, 254);
      doc.text('Please review before confirming', pageRight - 4, y + 5.5, { align: 'right' });
      line(105, y + 8, 105, y + termsHeight);
      let termY = y + 12;
      termRowHeights.forEach((rowHeight, rowIndex) => {
        termRows.forEach((column, columnIndex) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.2);
          doc.setTextColor(...ink);
          doc.text(column[rowIndex].lines, columnIndex === 0 ? 16 : 110, termY, { lineHeightFactor: 1.05 });
        });
        termY += rowHeight;
      });
      y += termsHeight + 5;
      if (y + 14 > contentBottom) {
        doc.addPage();
        y = startPage(true) + 5;
      }
      line(135, y + 3, 198, y + 3);
      write(`For ${selectedBranchDetails.headerName}`, 198, y + 8, 5.6, 'normal', 'right');
      write('Authorized Signatory', 198, y + 13, 5.8, 'bold', 'right');
      doc.setFontSize(5.5);
      doc.setTextColor(...muted);
      doc.text(`Thank you for choosing ${company.brand}.`, 105, 286, { align: 'center' });
      doc.save(`${assignedNumber}.pdf`);
      setNotice(`Quotation ${assignedNumber} PDF generated successfully.`);
      showSuccess(`Quotation ${assignedNumber} PDF generated successfully.`);
      return assignedNumber;
    } catch (error) {
      console.error('Could not generate quotation PDF:', error);
      setNotice('Could not generate the quotation PDF.');
      showError('Could not generate quotation PDF.');
      return null;
    } finally {
      setPdfBusy(false);
    }
  };

  const whatsappQuotation = async () => {
    if (!customer) {
      const message = 'Select a customer before sharing the quotation.';
      setNotice(message);
      showError(message);
      return;
    }
    if (!customer.phone) {
      const message = 'Add a phone number to the selected customer before sending the quotation via WhatsApp.';
      setNotice(message);
      showError(message);
      return;
    }
    if (!lines.length) {
      const message = 'Select at least one inventory item before sharing the quotation.';
      setNotice(message);
      showError(message);
      return;
    }
    let phone = String(customer.phone || '').replace(/\D/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    if (phone.length === 10) phone = `91${phone}`;
    else if (phone.length === 11 && phone.startsWith('0')) phone = `91${phone.slice(1)}`;
    if (phone.length < 8 || phone.length > 15) {
      const message = 'Add a valid customer phone number, including the country code, to share via WhatsApp.';
      setNotice(message);
      showError(message);
      return;
    }

    const whatsappWindow = window.open('about:blank', '_blank');
    if (!whatsappWindow) {
      const message = 'Allow pop-ups to open WhatsApp and share the quotation.';
      setNotice(message);
      showError(message);
      return;
    }
    whatsappWindow.opener = null;
    setWhatsappBusy(true);
    try {
      const assignedNumber = await generatePdf();
      if (!assignedNumber) {
        whatsappWindow.close();
        return;
      }
      const itemSummary = lines
        .map((item) => `• ${item.name} × ${item.quantity}: ${money(item.lineTotal)}`)
        .join('\n');
      const formattedValidity = validUntil
        ? new Date(`${validUntil}T00:00:00`).toLocaleDateString('en-IN')
        : 'As agreed';
      const message = [
        `Hello ${customer.name || 'there'},`,
        '',
        'Please find the NanoSpace quotation attached.',
        `Quotation: ${assignedNumber}`,
        `Branch: ${selectedBranchDetails.name}`,
        `Items:\n${itemSummary}`,
        `Total: ${money(total)}`,
        `Valid until: ${formattedValidity}`,
        '',
        'Please review and let us know if you have any questions.',
        'NanoSpace Co-Working',
      ].join('\n');
      whatsappWindow.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      const noticeMessage = `Quotation PDF downloaded and WhatsApp opened for ${customer.name}. Attach the downloaded PDF before sending.`;
      setNotice(noticeMessage);
      showSuccess(noticeMessage);
    } catch (error) {
      whatsappWindow.close();
      console.error('Could not prepare quotation for WhatsApp:', error);
      const message = 'Could not prepare the quotation for WhatsApp.';
      setNotice(message);
      showError(message);
    } finally {
      setWhatsappBusy(false);
    }
  };

  const emailQuotation = async () => {
    if (!isApiEnabled) {
      const message = 'Email delivery requires API mode and a configured backend SMTP account.';
      setNotice(message);
      showError(message);
      return;
    }
    if (!customer?.email) {
      const message = 'The selected customer must have an email address before sending a quotation.';
      setNotice(message);
      showError(message);
      return;
    }
    if (!lines.length) {
      const message = 'Select at least one inventory item before sending the quotation.';
      setNotice(message);
      showError(message);
      return;
    }

    setEmailBusy(true);
    try {
      const assignedNumber = quotationSaved ? quoteNumber : await saveDraft();
      if (!assignedNumber) return;
      const response = await api.quotations.sendEmail(assignedNumber);
      const record = getApiPayload(response);
      setApiQuotations((current) => current.map((quotation) => (
        quotation.quotation_number === assignedNumber
          ? { ...quotation, status: record?.status || 'SENT' }
          : quotation
      )));
      const message = `Quotation ${assignedNumber} sent to ${record?.email || customer.email}.`;
      setNotice(message);
      showSuccess(message);
      onSaved?.();
    } catch (error) {
      console.error('Could not email quotation:', error);
      const message = getApiErrorMessage(error, 'Quotation email could not be sent.');
      setNotice(message);
      showError(message);
    } finally {
      setEmailBusy(false);
    }
  };

  const handleSelect = ({ selectedRows }) => setSelected(selectedRows);

  return (
    <div className="quotation-builder">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">NANOSPACE / SALES</div>
          <h2>Create quotation</h2>
          <p>Select a customer, choose items from inventory and prepare a branded PDF proposal.</p>
        </div>
        <Badge color="light" className="text-dark">Quotation · {quoteNumber}</Badge>
      </div>
      {notice && (
        <Alert color={notice.toLowerCase().includes('saved') || notice.toLowerCase().includes('generated') ? 'success' : 'warning'} toggle={() => setNotice('')}>
          {notice}
        </Alert>
      )}
      <Row className="g-4">
        <Col xl="8">
          <Card className="panel-card border-0">
            <CardBody>
              <div className="section-heading">
                <span className="section-icon"><FiUserCheck /></span>
                <div><h3>Customer & quotation details</h3><p>The quotation will be associated with the selected customer.</p></div>
              </div>
              <Row>
                <Col md="7">
                  <FormGroup>
                    <Label>Select customer <span className="required-star">*</span></Label>
                    <Input type="select" value={customerId} onChange={(event) => {
                      if (event.target.value !== customerId) invalidateSavedQuotation();
                      setCustomerId(event.target.value);
                      setWhatsappOptInConfirmed(false);
                      const selectedCustomer = customers.find((entry) => (entry.id || entry._id || entry.email) === event.target.value);
                      if (selectedCustomer && user.role === 'super_admin' && selectedCustomer.branch) setBranch(selectedCustomer.branch);
                    }}>
                      <option value="">Choose a customer...</option>
                      {customerOptions.map((entry) => <option key={entry.id || entry.email} value={entry.id || entry.email}>{entry.name} — {entry.company || 'Individual'}</option>)}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="5">
                  <FormGroup>
                    <Label>Branch</Label>
                    <Input type="select" value={branch} disabled={user.role !== 'super_admin'} onChange={(event) => {
                      if (event.target.value !== branch) invalidateSavedQuotation();
                      setBranch(event.target.value);
                    }}>
                      {['KPHB', 'Nanakramguda', 'Jubilee Hills', 'Kokapet'].map((name) => <option key={name}>{name}</option>)}
                    </Input>
                    <small className="text-secondary d-block mt-1">
                      {selectedBranchDetails.address}
                      {selectedBranchDetails.phone ? ` · ${selectedBranchDetails.phone}` : ''}
                    </small>
                  </FormGroup>
                </Col>
              </Row>
              {customer && (
                <div className="customer-inline-card">
                  <div className="customer-avatar">{customer.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
                  <div><strong>{customer.name}</strong><p>{customer.company || 'Individual'} · {customer.email || customer.phone}</p></div>
                  <Badge color="success" pill>Customer selected</Badge>
                </div>
              )}
            </CardBody>
          </Card>
          <Card className="panel-card border-0 mt-4">
            <CardBody>
              <div className="panel-toolbar inventory-toolbar">
                <div><h3>Inventory catalogue</h3><p>Prices are loaded from your NanoSpace inventory.</p></div>
                <div className="table-search"><FiSearch size={16} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inventory..." bsSize="sm" /></div>
              </div>
              <div className="inventory-table">
                <SelectableDataTable
                  columns={columns}
                  data={filteredInventory}
                  keyField="id"
                  selectableRows
                  selectableRowsHighlight
                  highlightOnHover
                  pagination
                  paginationPerPage={6}
                  paginationRowsPerPageOptions={[6, 10, 15]}
                  persistTableHead
                  onSelectedRowsChange={handleSelect}
                  noDataComponent="No inventory items match your search."
                />
              </div>
              <small className="text-secondary d-block mt-2">Select any number of items, then set the quantity in the quotation summary.</small>
            </CardBody>
          </Card>
          <Card className="panel-card border-0 mt-4">
            <CardBody>
              <div className="section-heading">
                <span className="section-icon"><FiFileText /></span>
                <div><h3>Tax, terms & validity</h3><p>GST is calculated at 18% by default; change the rate or tax treatment if required.</p></div>
              </div>
              <Row>
                <Col md="6"><FormGroup><Label>Valid until</Label><Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></FormGroup></Col>
                <Col md="3"><FormGroup><Label>Discount (₹)</Label><Input type="number" min="0" max={subtotal} value={discount} onChange={(event) => setDiscount(event.target.value)} /></FormGroup></Col>
                <Col md="3"><FormGroup><Label>GST rate (%)</Label><Input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} /></FormGroup></Col>
              </Row>
              <FormGroup>
                <Label>Tax treatment</Label>
                <Input type="select" value={taxMode} onChange={(event) => setTaxMode(event.target.value)}>
                  <option value="CGST_SGST">Intra-state: CGST {parsedTaxRate / 2}% + SGST {parsedTaxRate / 2}%</option>
                  <option value="IGST">Inter-state: IGST {parsedTaxRate}%</option>
                </Input>
              </FormGroup>
              <FormGroup><Label>Notes</Label><Input type="textarea" rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes for the quotation..." /></FormGroup>
              <small className="text-muted">The PDF includes the company details and all 14 configured terms and conditions.</small>
            </CardBody>
          </Card>
        </Col>
        <Col xl="4">
          <Card className="quote-summary-card border-0">
            <CardBody>
              <div className="quote-summary-head">
                <span className="summary-symbol"><FiFileText /></span>
                <div><small>QUOTATION SUMMARY</small><h4>{quoteNumber}</h4></div>
              </div>
              <div className="quote-customer-summary">
                <span>Prepared for</span><strong>{customer?.name || 'Select a customer'}</strong><small>{customer?.email || 'Customer email appears here'}</small>
              </div>
              <div className="quote-line-items">
                {lines.length ? lines.map((item) => (
                  <div className="quote-line" key={item.id}>
                    <div className="quote-line-copy">
                      <strong>{item.name}</strong><small>{money(item.rate)} / {item.unit}</small>
                      <button type="button" onClick={() => setSelected((current) => current.filter((entry) => entry.id !== item.id))} className="remove-line"><FiTrash2 /> Remove</button>
                    </div>
                    <div className="quote-line-right">
                      <Input aria-label={`Quantity for ${item.name}`} type="number" min="1" step="1" value={quantities[item.id] || 1} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} />
                      <strong>{money(item.lineTotal)}</strong>
                    </div>
                  </div>
                )) : <div className="empty-quote"><FiPlus /><strong>No items selected yet</strong><span>Choose inventory rows to add them here.</span></div>}
              </div>
              <div className="quote-totals">
                <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
                <div><span>Discount</span><strong>− {money(discountAmount)}</strong></div>
                {taxMode === 'IGST'
                  ? <div><span>IGST ({parsedTaxRate}%)</span><strong>{money(taxAmount)}</strong></div>
                  : <>
                    <div><span>CGST ({parsedTaxRate / 2}%)</span><strong>{money(taxAmount / 2)}</strong></div>
                    <div><span>SGST ({parsedTaxRate / 2}%)</span><strong>{money(taxAmount - taxAmount / 2)}</strong></div>
                  </>}
                <div className="grand-total"><span>Grand total</span><strong>{money(total)}</strong></div>
              </div>
              <Button color="primary" block className="btn-primary-custom mt-3" onClick={saveDraft} disabled={apiBusy || quotationSaved}>
                <FiPlus className="me-2" />{apiBusy ? 'Saving…' : quotationSaved ? 'Quotation saved' : 'Save quotation'}
              </Button>
              <Button color="primary" outline block className="mt-2" onClick={generatePdf} disabled={apiBusy || pdfBusy}>
                <FiDownload className="me-2" />{pdfBusy ? 'Generating…' : 'Generate quotation PDF'}
              </Button>
              <Button color="light" block className="mt-2" onClick={emailQuotation} disabled={apiBusy || emailBusy || whatsappBusy || !customer?.email || !lines.length}>
                <FiMail className="me-2" />{emailBusy ? 'Sending…' : 'Email to customer'}
              </Button>
              <Button color="success" block className="mt-2" onClick={whatsappQuotation} disabled={apiBusy || pdfBusy || emailBusy || whatsappBusy || !customer?.phone || !lines.length}>
                <SiWhatsapp className="me-2" />{whatsappBusy ? 'Preparing…' : 'Share on WhatsApp'}
              </Button>
              <small className="text-muted d-block mt-2">
                WhatsApp opens with a prepared message and downloads the PDF. Attach the PDF in WhatsApp before sending.
              </small>
              <div className="pdf-note">Company branding, customer details, GST breakdown, amount in words and all terms appear in the PDF.</div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
