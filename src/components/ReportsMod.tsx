/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, DollarSign, ArrowDownRight, ArrowUpRight, CheckCircle,
  MessageSquare, Download, FileSpreadsheet, TrendingUp, Sparkles, Activity, AlertTriangle, FileText, Printer, Filter, X
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Client, IncubatorRecord, Flock, FeedRecord, PoultrySale, Mortality, Expense, DbSchema } from '../types';
import { quailEggBalance } from '../lib/farmActions';
import { farmRecordViews } from '../lib/farmViews';
import { getCameroonTodayISO, formatDateDDMMYYYY, formatDateShortDDMM, formatFlockAge } from '../utils/dateUtils';

export type PdfPeriod = '1_week' | '2_weeks' | '1_month' | '6_months' | '1_year' | 'all_time';
export type PdfScope = 'all' | 'farm' | 'incubator';

const PERIOD_LABELS: Record<PdfPeriod, string> = {
  '1_week': 'Last 1 Week (7 Days)',
  '2_weeks': 'Last 2 Weeks (14 Days)',
  '1_month': 'Last 1 Month (30 Days)',
  '6_months': 'Last 6 Months (180 Days)',
  '1_year': 'Last 1 Year (365 Days)',
  'all_time': 'All Time (Full History)'
};

const SCOPE_LABELS: Record<PdfScope, string> = {
  'all': 'Whole Farm & Incubator Combined',
  'farm': 'Farm Operations Only',
  'incubator': 'Incubator & Hatchery Only'
};

function filterByPdfPeriod(dateStr: string, period: PdfPeriod): boolean {
  if (period === 'all_time') return true;
  if (!dateStr) return false;
  const itemMs = new Date(dateStr).getTime();
  if (isNaN(itemMs)) return true;

  const nowMs = new Date().getTime();
  let days = 7;
  if (period === '2_weeks') days = 14;
  else if (period === '1_month') days = 30;
  else if (period === '6_months') days = 180;
  else if (period === '1_year') days = 365;

  const cutoffMs = nowMs - (days * 24 * 60 * 60 * 1000);
  return itemMs >= cutoffMs;
}

export function generatePdfReport(
  db: Partial<DbSchema> & {
    clients: Client[];
    incubator_records: IncubatorRecord[];
    flocks: Flock[];
    feed_records: FeedRecord[];
    poultry_sales: PoultrySale[];
    mortality: Mortality[];
    expenses: Expense[];
  },
  period: PdfPeriod,
  scope: PdfScope
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Filter datasets by period
  const incubatorRecs = db.incubator_records.filter(r => filterByPdfPeriod(r.dateBrought, period));
  const poultrySales = db.poultry_sales.filter(s => !s.voided && filterByPdfPeriod(s.date, period));
  const rabbitSales = (db.rabbit_sales || []).filter(s => !s.voided && filterByPdfPeriod(s.date, period));
  const feedRecs = db.feed_records.filter(f => filterByPdfPeriod(f.date, period));
  const expenseRecs = db.expenses.filter(e => filterByPdfPeriod(e.date, period));
  const mortalityRecs = farmRecordViews(db).mortality.filter(m => filterByPdfPeriod(m.date, period));
  const flocks = db.flocks; // Current flock stock

  // Calculate Key Summary Metrics
  const totalSalesRev = poultrySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0) + rabbitSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  const totalIncubatorPaid = incubatorRecs.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
  const totalIncubatorDue = incubatorRecs.reduce((acc, r) => acc + (r.amountDue || 0), 0);

  const totalFeedCost = feedRecs.reduce((acc, f) => acc + (f.totalCost || 0), 0);
  const totalOtherExpenses = expenseRecs.reduce((acc, e) => acc + (e.amount || 0), 0);
  const totalExpenses = totalFeedCost + totalOtherExpenses;

  let totalRevenue = 0;
  if (scope === 'all') totalRevenue = totalSalesRev + totalIncubatorPaid;
  else if (scope === 'farm') totalRevenue = totalSalesRev;
  else if (scope === 'incubator') totalRevenue = totalIncubatorPaid;

  const netProfit = totalRevenue - (scope === 'incubator' ? 0 : totalExpenses);

  const totalEggsIncubated = incubatorRecs.reduce((acc, r) => acc + (r.eggsCollected || 0), 0);
  const totalChicksHatched = incubatorRecs.reduce((acc, r) => acc + (r.chicksHatched || 0), 0);
  const hatchRate = totalEggsIncubated > 0 ? ((totalChicksHatched / totalEggsIncubated) * 100) : 0;

  const totalBirdsInStock = flocks.reduce((acc, f) => acc + (f.quantity || 0), 0);
  const totalRabbitsInStock = (db.rabbits || []).filter(item => item.status === 'active').length;
  const totalMortality = mortalityRecs.reduce((acc, m) => acc + (m.quantity || 0), 0);

  // --- HEADER BANNER ---
  doc.setFillColor(4, 120, 87); // Emerald 700 (#047857)
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('NEW VISION FARMS', 14, 11);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(204, 251, 241); // Teal 100
  doc.text('BRAHMA EGG HATCHERY & POULTRY MANAGEMENT PORTAL', 14, 17);

  const reportDateStr = formatDateDDMMYYYY(new Date());
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(`Generated: ${reportDateStr}`, pageWidth - 14, 14, { align: 'right' });

  let y = 30;

  // --- REPORT METADATA BOX ---
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.roundedRect(14, y, pageWidth - 28, 16, 3, 3, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.setFont('helvetica', 'bold');
  doc.text(`Period Scope: ${PERIOD_LABELS[period]}`, 18, y + 6);
  doc.text(`Report Target: ${SCOPE_LABELS[scope]}`, 18, y + 12);

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`Status: Official Operations Snapshot`, pageWidth - 18, y + 9, { align: 'right' });

  y += 22;

  // --- EXECUTIVE KPI DASHBOARD SUMMARY (3 CARDS) ---
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('1. Executive KPI Summary Dashboard', 14, y);
  y += 4;

  const cardWidth = (pageWidth - 28 - 8) / 3;
  const cardHeight = 22;

  // Card 1: Revenue & Net Profit
  doc.setFillColor(240, 253, 250); // Teal 50
  doc.setDrawColor(204, 251, 241);
  doc.roundedRect(14, y, cardWidth, cardHeight, 2, 2, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 118, 110); // Teal 700
  doc.text('TOTAL REVENUE / NET PROFIT', 17, y + 5);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 148, 136);
  doc.text(`${totalRevenue.toLocaleString()} FCFA`, 17, y + 11);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Net Margin: ${netProfit.toLocaleString()} FCFA`, 17, y + 17);

  // Card 2: Hatchery Performance
  doc.setFillColor(238, 242, 255); // Indigo 50
  doc.setDrawColor(224, 231, 255);
  doc.roundedRect(14 + cardWidth + 4, y, cardWidth, cardHeight, 2, 2, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(67, 56, 202); // Indigo 700
  doc.text('HATCHERY PERFORMANCE', 17 + cardWidth + 4, y + 5);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229);
  doc.text(`${totalEggsIncubated} Eggs | ${totalChicksHatched} Hatched`, 17 + cardWidth + 4, y + 11);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Avg Hatch Rate: ${hatchRate.toFixed(1)}%`, 17 + cardWidth + 4, y + 17);

  // Card 3: Flock Stock & Losses
  doc.setFillColor(255, 241, 242); // Rose 50
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(14 + (cardWidth + 4) * 2, y, cardWidth, cardHeight, 2, 2, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(190, 18, 60); // Rose 700
  doc.text('FLOCK STOCK & HEALTH', 17 + (cardWidth + 4) * 2, y + 5);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(225, 29, 72);
  doc.text(`${totalBirdsInStock} Birds in Stock`, 17 + (cardWidth + 4) * 2, y + 11);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`${totalRabbitsInStock} Rabbits | ${totalMortality} bird losses`, 17 + (cardWidth + 4) * 2, y + 17);

  y += cardHeight + 8;

  // --- VISUAL SUMMARY CHARTS & GRAPHICAL BARS ---
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. Visual Financial & Hatchery Comparison Graphs', 14, y);
  y += 5;

  // Background Box for Graphs
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, pageWidth - 28, 30, 3, 3, 'FD');

  const graphBoxX = 18;
  const graphBoxWidth = pageWidth - 36;

  // Graph Bar 1: Financial Breakdown (Revenue vs Expenses)
  const maxFinancial = Math.max(totalRevenue, totalExpenses, 1);
  const revWidth = (totalRevenue / maxFinancial) * (graphBoxWidth - 75);
  const expWidth = (totalExpenses / maxFinancial) * (graphBoxWidth - 75);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Financials:', graphBoxX, y + 8);

  // Revenue Bar
  doc.setFillColor(16, 185, 129); // Emerald 500
  doc.rect(graphBoxX + 22, y + 5, Math.max(3, revWidth), 4, 'F');
  doc.setFontSize(7);
  doc.setTextColor(16, 185, 129);
  doc.text(`Rev: ${totalRevenue.toLocaleString()} FCFA`, graphBoxX + 25 + Math.max(3, revWidth), y + 8);

  // Expense Bar
  doc.setFillColor(239, 68, 68); // Red 500
  doc.rect(graphBoxX + 22, y + 11, Math.max(3, expWidth), 4, 'F');
  doc.setFontSize(7);
  doc.setTextColor(239, 68, 68);
  doc.text(`Exp: ${totalExpenses.toLocaleString()} FCFA`, graphBoxX + 25 + Math.max(3, expWidth), y + 14);

  // Graph Bar 2: Hatching Efficiency Bar
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Hatch Rate:', graphBoxX, y + 23);

  // Track background
  const hatchBarWidth = graphBoxWidth - 75;
  doc.setFillColor(226, 232, 240);
  doc.rect(graphBoxX + 22, y + 20, hatchBarWidth, 5, 'F');

  // Fill bar
  const hatchFill = (Math.min(100, Math.max(0, hatchRate)) / 100) * hatchBarWidth;
  doc.setFillColor(99, 102, 241); // Indigo 500
  doc.rect(graphBoxX + 22, y + 20, hatchFill, 5, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(79, 70, 229);
  doc.text(`${hatchRate.toFixed(1)}% (${totalChicksHatched}/${totalEggsIncubated} eggs)`, graphBoxX + 25 + hatchBarWidth, y + 24);

  y += 36;

  // --- TABULATOR TABLES ---
  // Table 1: Incubator Records
  if (scope === 'all' || scope === 'incubator') {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('3. Incubator & Hatchery Batches Tabulator', 14, y);
    y += 3;

    const incubatorRows = incubatorRecs.map(r => [
      r.clientMark || 'XX',
      r.clientName || 'Unregistered',
      r.eggType || 'Brahma',
      formatDateDDMMYYYY(r.dateBrought),
      r.eggsCollected || 0,
      `${(r.amountDue || 0).toLocaleString()} FCFA`,
      `${(r.amountPaid || 0).toLocaleString()} FCFA`,
      r.chicksHatched !== null && r.chicksHatched !== undefined ? `${r.chicksHatched} chicks` : 'Pending'
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Mark', 'Client Name', 'Egg Type', 'Brought Date', 'Eggs', 'Amount Due', 'Paid', 'Status / Hatched']],
      body: incubatorRows.length > 0 ? incubatorRows : [['--', 'No records found in selected period', '--', '--', '--', '--', '--', '--']],
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Table 2: Flock Stock & Health Inventory
  if (scope === 'all' || scope === 'farm') {
    if (y > pageHeight - 40) { doc.addPage(); y = 16; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('4. Flock Stock & Mortality Health Log', 14, y);
    y += 3;

    const flockRows = flocks.map(f => {
      const flockMortalities = mortalityRecs.filter(m => m.flockId === f.id);
      const mortQty = flockMortalities.reduce((acc, m) => acc + m.quantity, 0);
      return [
        f.name,
        f.species || 'Chicken',
        f.breed,
        formatFlockAge(f.dateAdded, f.initialAgeWeeks ?? 0),
        `${f.quantity} birds`,
        `${mortQty} birds lost`
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [['Flock Name', 'Species', 'Breed', 'Age', 'Stock Count', 'Period Mortality']],
      body: flockRows.length > 0 ? flockRows : [['--', 'No active flocks registered', '--', '--', '--', '--']],
      theme: 'grid',
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Table 3: Poultry Sales Ledger
  if (scope === 'all' || scope === 'farm') {
    if (y > pageHeight - 40) { doc.addPage(); y = 16; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('5. Farm Sales & Revenue Ledger', 14, y);
    y += 3;

    const salesRows = poultrySales.map(s => [
      formatDateDDMMYYYY(s.date),
      s.itemType,
      s.buyerName,
      s.quantity,
      `${s.unitPrice.toLocaleString()} FCFA`,
      `${s.totalAmount.toLocaleString()} FCFA`
    ]).concat(rabbitSales.map(s => [
      formatDateDDMMYYYY(s.date),
      'Live Rabbit',
      s.buyerName,
      s.rabbitIds.length,
      `${(s.totalAmount / s.rabbitIds.length).toLocaleString()} FCFA`,
      `${s.totalAmount.toLocaleString()} FCFA`
    ]));

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Item Type', 'Buyer Name', 'Qty', 'Unit Price', 'Total Amount']],
      body: salesRows.length > 0 ? salesRows : [['--', 'No sales recorded in selected period', '--', '--', '--', '--']],
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Table 4: Feed & Operating Expenses Log
  if (scope === 'all' || scope === 'farm') {
    if (y > pageHeight - 40) { doc.addPage(); y = 16; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('6. Feed & Operational Expenses Log', 14, y);
    y += 3;

    const feedRows = feedRecs.map(f => [
      formatDateDDMMYYYY(f.date),
      'Feed Purchase',
      `${f.feedType} (${f.bagsBought} bags @ ${f.costBag.toLocaleString()} FCFA)`,
      `${f.totalCost.toLocaleString()} FCFA`
    ]);

    const otherExpRows = expenseRecs.map(e => [
      formatDateDDMMYYYY(e.date),
      e.category,
      e.description,
      `${e.amount.toLocaleString()} FCFA`
    ]);

    const combinedExpenseRows = [...feedRows, ...otherExpRows];

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Category', 'Description / Details', 'Total Cost']],
      body: combinedExpenseRows.length > 0 ? combinedExpenseRows : [['--', 'No expenses recorded in selected period', '--', '--']],
      theme: 'grid',
      headStyles: { fillColor: [225, 29, 72], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 }
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Stamp / Signature Footer
  if (y > pageHeight - 30) { doc.addPage(); y = 16; }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  doc.text('This document is an officially generated periodic operational report from NEW VISION FARMS Management System.', 14, y);

  // Page Numbers Footer Loop
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.text(`NEW VISION FARMS PORTAL  |  Page ${i} of ${totalPages}`, 14, pageHeight - 7);
    doc.text(`Period: ${PERIOD_LABELS[period]}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }

  // Save the PDF
  const filenamePeriod = period.replace('_', '-');
  const filenameScope = scope;
  const dateStamp = getCameroonTodayISO();
  doc.save(`NVF_Farm_Report_${filenameScope}_${filenamePeriod}_${dateStamp}.pdf`);
}

interface ReportsModProps {
  db: Partial<DbSchema> & {
    clients: Client[];
    incubator_records: IncubatorRecord[];
    flocks: Flock[];
    feed_records: FeedRecord[];
    poultry_sales: PoultrySale[];
    mortality: Mortality[];
    expenses: Expense[];
  };
}

export default function ReportsMod({ db }: ReportsModProps) {
  const [reportRange, setReportRange] = useState<'this_week' | 'all_time'>('all_time');

  // PDF Generator States
  const [pdfPeriod, setPdfPeriod] = useState<PdfPeriod>('1_month');
  const [pdfScope, setPdfScope] = useState<PdfScope>('all');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [reportNotification, setReportNotification] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (reportNotification) {
      const timer = setTimeout(() => setReportNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [reportNotification]);

  const handleGeneratePdf = () => {
    setIsGeneratingPdf(true);
    setTimeout(() => {
      try {
        generatePdfReport(db, pdfPeriod, pdfScope);
        setReportNotification({ type: 'success', message: 'PDF report generated and opened in print preview!' });
      } catch (err) {
        console.error('Failed to generate PDF report:', err);
        setReportNotification({ type: 'error', message: 'An error occurred while generating the PDF report. Please try again.' });
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 100);
  };

  // Calculate last 30 days mortality data for recharts line chart
  const mortality30DaysData = useMemo(() => {
    const data: { date: string; displayDate: string; mortality: number; causeSummary: string }[] = [];
    const now = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = formatDateShortDDMM(d);

      const dayRecords = farmRecordViews(db).mortality.filter(m => m.date === dateStr);
      const totalQty = dayRecords.reduce((acc, m) => acc + (m.quantity || 0), 0);
      const causes = Array.from(new Set(dayRecords.map(m => m.cause).filter(Boolean))).join(', ');

      data.push({
        date: dateStr,
        displayDate,
        mortality: totalQty,
        causeSummary: causes || 'No losses'
      });
    }
    return data;
  }, [db.mortality, db.rabbit_losses, db.rabbits]);

  const total30DayMortality = useMemo(() => {
    return mortality30DaysData.reduce((acc, d) => acc + d.mortality, 0);
  }, [mortality30DaysData]);

  const avgDailyMortality = (total30DayMortality / 30).toFixed(1);

  const peakDay = useMemo(() => {
    return [...mortality30DaysData].sort((a, b) => b.mortality - a.mortality)[0];
  }, [mortality30DaysData]);

  // Date filters
  const today = new Date().getTime();
  const oneWeekAgoMs = today - 7 * 24 * 60 * 60 * 1000;

  const filterByDate = (dateStr: string) => {
    if (reportRange === 'all_time') return true;
    const ms = new Date(dateStr).getTime();
    return ms >= oneWeekAgoMs && ms <= today + 2 * 24 * 60 * 60 * 1000;
  };

  // 1. FINANCIAL CALCULATIONS
  // Revenues: Poultry Sales + Incubator deposits cleared
  const salesRev = db.poultry_sales
    .filter(s => !s.voided && filterByDate(s.date))
    .reduce((acc, s) => acc + s.totalAmount, 0)
    + (db.rabbit_sales || []).filter(s => !s.voided && filterByDate(s.date)).reduce((acc, s) => acc + s.totalAmount, 0);

  const incubatorRev = db.incubator_records
    .filter(r => filterByDate(r.dateBrought))
    .reduce((acc, r) => acc + r.amountPaid, 0);

  const totalRevenue = salesRev + incubatorRev;

  // Expenses: Feed Purchases + Other Expenses
  const feedExp = db.feed_records
    .filter(f => filterByDate(f.date))
    .reduce((acc, f) => acc + f.totalCost, 0);

  const otherExp = db.expenses
    .filter(e => filterByDate(e.date))
    .reduce((acc, e) => acc + e.amount, 0);

  const totalExpenses = feedExp + otherExp;
  const netProfit = totalRevenue - totalExpenses;

  // 2. OUTSTANDING PAYMENTS DATA
  interface OutstandingRecord {
    id: string;
    clientName: string;
    clientMark: string;
    phone: string;
    datePlaced: string;
    totalAmount: number;
    amountPaid: number;
    amountDue: number; // outstanding
  }

  const outstandingList: OutstandingRecord[] = [];
  db.incubator_records.forEach(rec => {
    const due = rec.amountDue;
    const paid = rec.amountPaid;
    const owes = due - paid;
    if (owes > 0) {
      outstandingList.push({
        id: rec.id,
        clientName: rec.clientName,
        clientMark: rec.clientMark,
        phone: rec.clientPhone,
        datePlaced: rec.dateBrought,
        totalAmount: due,
        amountPaid: paid,
        amountDue: owes
      });
    }
  });

  // 3. TOP CLIENTS RANKING
  // Sum total eggs brought by clientName all-time
  const clientRankMap: { [mark: string]: { name: string; mark: string; totalEggs: number; batchesCount: number } } = {};
  
  db.incubator_records.forEach(rec => {
    const mark = rec.clientMark;
    if (!clientRankMap[mark]) {
      clientRankMap[mark] = {
        name: rec.clientName,
        mark: rec.clientMark,
        totalEggs: 0,
        batchesCount: 0
      };
    }
    clientRankMap[mark].totalEggs += rec.eggsCollected;
    clientRankMap[mark].batchesCount += 1;
  });

  const sortedTopClients = Object.values(clientRankMap).sort((a, b) => b.totalEggs - a.totalEggs);

  // WhatsApp click handler for reminders
  const triggerWhatsAppReminder = (client: OutstandingRecord) => {
    const text = `Hello *${client.clientName}* (${client.clientMark}), this is New Vision Farms. Friendly reminder for your egg batch of date ${client.datePlaced}: Outstanding incubator balance is *${client.amountDue.toLocaleString()} FCFA*. Thank you!`;
    const cleanPhone = client.phone.replace(/\D/g, '');
    const finalPhone = cleanPhone.startsWith('237') ? cleanPhone : `237${cleanPhone}`;
    const url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // 4. ONE-CLICK CSV EXPORT
  const convertToCSV = (arr: any[]): string => {
    if (arr.length === 0) return '';
    const keys = Object.keys(arr[0]).filter(k => k !== 'passwordHash'); // safety
    const header = keys.join(',');
    const rows = arr.map(row => {
      return keys.map(fieldName => {
        let val = row[fieldName];
        if (val === null || val === undefined) {
          return '""';
        }
        val = String(val).replace(/"/g, '""'); // escape double quotes
        if (val.includes(',') || val.includes('\n') || val.includes('\r')) {
          val = `"${val}"`;
        }
        return val;
      }).join(',');
    });
    return [header, ...rows].join('\r\n');
  };

  const handleDownloadCSV = (tableName: string, list: any[]) => {
    if (list.length === 0) {
      setReportNotification({ type: 'warning', message: `There is no row data available in "${tableName}" to export yet.` });
      return;
    }
    const csvContent = new Blob(['\ufeff', convertToCSV(list)], { type: 'text/csv;charset=utf-8' });
    const csvUrl = URL.createObjectURL(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', csvUrl);
    link.setAttribute('download', `new_version_farms_${tableName}_${getCameroonTodayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(csvUrl), 60_000);
    setReportNotification({ type: 'success', message: `Download started for ${tableName} (${list.length} rows).` });
  };

  return (
    <div id="reports_tab" className="space-y-6 pb-28">

      {/* In-app notification toast */}
      {reportNotification && (
        <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold border transition-all animate-in fade-in duration-150 ${
          reportNotification.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : reportNotification.type === 'warning'
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          <div className="flex items-center gap-2">
            {reportNotification.type === 'error' ? (
              <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            ) : reportNotification.type === 'warning' ? (
              <AlertTriangle size={16} className="shrink-0 text-amber-600" />
            ) : (
              <CheckCircle size={16} className="shrink-0 text-emerald-600" />
            )}
            <span>{reportNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setReportNotification(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}
      
      {/* Selector banner */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="text-2xl font-bold text-emerald-950">Reports</h2>
          <p className="text-slate-600 text-sm">See farm totals and download your records.</p>
        </div>
        
        <select
          id="report_range_selector"
          value={reportRange}
          onChange={(e) => setReportRange(e.target.value as any)}
          aria-label="Report period"
          className="h-12 px-3 border border-emerald-200 rounded-xl text-base font-semibold text-emerald-950 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all_time">All time</option>
          <option value="this_week">Last 7 days</option>
        </select>
      </div>

      <section aria-label="Rabbit and quail overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Rabbits on farm', value: (db.rabbits || []).filter(item => item.status === 'active').length.toLocaleString() },
          { label: 'Quail on farm', value: db.flocks.filter(item => item.species === 'Quail' || item.breed?.toLowerCase().includes('quail')).reduce((sum, item) => sum + item.quantity, 0).toLocaleString() },
          { label: 'Quail eggs available', value: quailEggBalance(db as DbSchema).toLocaleString() },
          { label: 'Animals used at home', value: farmRecordViews(db).fowls_eaten.filter(item => filterByDate(item.date)).reduce((sum, item) => sum + item.quantity, 0).toLocaleString() },
          { label: 'Rabbit and quail sales', value: ((db.rabbit_sales || []).filter(item => !item.voided && filterByDate(item.date)).reduce((sum, item) => sum + item.totalAmount, 0) + db.poultry_sales.filter(item => item.species === 'Quail' && !item.voided && filterByDate(item.date)).reduce((sum, item) => sum + item.totalAmount, 0)).toLocaleString() + ' FCFA' },
          { label: 'Rabbit costs', value: ((db.expenses || []).filter(item => item.species === 'Rabbit' && filterByDate(item.date)).reduce((sum, item) => sum + item.amount, 0) + (db.feed_records || []).filter(item => item.species === 'Rabbit' && filterByDate(item.date)).reduce((sum, item) => sum + item.totalCost, 0)).toLocaleString() + ' FCFA' },
          { label: 'Quail costs', value: ((db.expenses || []).filter(item => item.species === 'Quail' && filterByDate(item.date)).reduce((sum, item) => sum + item.amount, 0) + (db.feed_records || []).filter(item => item.species === 'Quail' && filterByDate(item.date)).reduce((sum, item) => sum + item.totalCost, 0)).toLocaleString() + ' FCFA' }
        ].map(item => <div key={item.label} className="rounded-2xl border border-emerald-100 bg-white p-4"><span className="block text-sm text-slate-600">{item.label}</span><strong className="mt-1 block text-xl text-emerald-950">{item.value}</strong></div>)}
      </section>

      {/* DOWNLOAD PDF SUMMARY REPORT CARD */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-6 text-white shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <FileText size={160} className="text-emerald-400" />
        </div>

        <div className="relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] uppercase tracking-widest font-extrabold px-3 py-1 rounded-full inline-flex items-center gap-1 mb-2">
                <Sparkles size={12} /> Printable PDF
              </span>
              <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                <Printer size={22} className="text-emerald-400" />
                Download report
              </h3>
              <p className="text-slate-300 text-xs font-medium mt-0.5">
                Save a summary of your farm and incubator records.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 landscape:grid-cols-3 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
            {/* Period Dropdown */}
            <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 space-y-1">
              <label className="text-[10px] font-extrabold text-teal-300 uppercase tracking-wider block">
                Time Period
              </label>
              <select
                id="pdf_period_select"
                value={pdfPeriod}
                onChange={(e) => setPdfPeriod(e.target.value as PdfPeriod)}
                className="w-full h-10 px-3 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="1_week">1 Week (Last 7 Days)</option>
                <option value="2_weeks">2 Weeks (Last 14 Days)</option>
                <option value="1_month">1 Month (Last 30 Days)</option>
                <option value="6_months">6 Months (Last 180 Days)</option>
                <option value="1_year">1 Year (Last 365 Days)</option>
                <option value="all_time">All Time (Full History)</option>
              </select>
            </div>

            {/* Scope Dropdown */}
            <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/10 space-y-1">
              <label className="text-[10px] font-extrabold text-teal-300 uppercase tracking-wider block">
                Target Scope
              </label>
              <select
                id="pdf_scope_select"
                value={pdfScope}
                onChange={(e) => setPdfScope(e.target.value as PdfScope)}
                className="w-full h-10 px-3 bg-slate-900 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="all">Whole Farm & Incubator Combined</option>
                <option value="farm">Farm Operations Only</option>
                <option value="incubator">Incubator & Hatchery Only</option>
              </select>
            </div>

            {/* Download Action Button */}
            <div className="sm:col-span-2 lg:col-span-1 flex items-end">
              <button
                id="download_pdf_report_btn"
                onClick={handleGeneratePdf}
                disabled={isGeneratingPdf}
                className="w-full h-10 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
              >
                {isGeneratingPdf ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Compiling PDF...</span>
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    <span>Download PDF Summary</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FINANCIAL LEDGER OVERVIEW */}
      <div className="bg-gradient-to-r from-teal-800 to-emerald-700 rounded-3xl p-6 text-white shadow-md">
        <h3 className="text-xs font-black uppercase tracking-wider mb-4 text-teal-200">
          Financial Ledger Summary ({reportRange === 'all_time' ? 'All-Time' : 'Last 7 Days'})
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3.5 bg-white/5 border border-white/5 rounded-2xl">
            <div className="flex items-center gap-1.5 text-xs text-teal-200 mb-1 font-bold uppercase">
              <ArrowUpRight size={14} className="text-emerald-400" />
              <span>Full Revenues</span>
            </div>
            <strong className="text-[21px] leading-tight font-black">
              {totalRevenue.toLocaleString()} <span className="text-xs font-normal">FCFA</span>
            </strong>
            <p className="text-[9px] text-teal-300 mt-1 uppercase font-semibold">
              Hatchery: {incubatorRev.toLocaleString()} | Sales: {salesRev.toLocaleString()}
            </p>
          </div>

          <div className="p-3.5 bg-white/5 border border-white/5 rounded-2xl">
            <div className="flex items-center gap-1.5 text-xs text-rose-300 mb-1 font-bold uppercase">
              <ArrowDownRight size={14} className="text-rose-450 text-rose-300" />
              <span>Paid Outlays</span>
            </div>
            <strong className="text-[21px] leading-tight font-black">
              {totalExpenses.toLocaleString()} <span className="text-xs font-normal">FCFA</span>
            </strong>
            <p className="text-[9px] text-teal-300 mt-1 uppercase font-semibold">
              Feed: {feedExp.toLocaleString()} | Other: {otherExp.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Big Net Result Block */}
        <div className="mt-4 p-4 bg-teal-950/40 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-teal-300 uppercase tracking-widest block">Net Operating Profit</span>
            <span className="text-xs text-emerald-300 mt-0.5 font-medium">Revenues minus farm costs</span>
          </div>
          <strong className={`text-2xl font-black ${netProfit >= 0 ? 'text-emerald-400 animate-pulse' : 'text-rose-300'}`}>
            {netProfit.toLocaleString()} FCFA
          </strong>
        </div>
      </div>

      {/* 30-DAY POULTRY MORTALITY TREND LINE CHART (RECHARTS) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
              <Activity size={18} className="text-rose-600" />
              Mortality Rates (Last 30 Days)
            </h3>
            <p className="text-slate-400 text-xs font-semibold">Daily bird losses trend and health monitoring</p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs font-bold">
            <div className="bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl text-rose-700 flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-rose-500">30d Total:</span>
              <span className="font-extrabold">{total30DayMortality} birds</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-slate-700 flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Avg/Day:</span>
              <span className="font-extrabold">{avgDailyMortality}</span>
            </div>
          </div>
        </div>

        {/* Recharts Line Chart */}
        <div className="w-full h-64 sm:h-72 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mortality30DaysData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="displayDate" 
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                interval={3}
              />
              <YAxis 
                allowDecimals={false}
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl text-xs border border-slate-700">
                        <p className="font-bold text-slate-300 mb-1">{item.date} ({item.displayDate})</p>
                        <div className="flex items-center gap-2 font-extrabold text-rose-400">
                          <span>Mortality Count:</span>
                          <span className="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-lg font-mono">
                            {item.mortality} birds
                          </span>
                        </div>
                        {item.causeSummary && item.causeSummary !== 'No losses' && (
                          <p className="text-[11px] text-amber-300 mt-1.5 font-medium flex items-center gap-1">
                            <AlertTriangle size={12} className="shrink-0" />
                            <span>Cause: {item.causeSummary}</span>
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line 
                type="monotone" 
                dataKey="mortality" 
                name="Mortality" 
                stroke="#e11d48" 
                strokeWidth={3} 
                dot={{ r: 3, fill: '#e11d48', strokeWidth: 2, stroke: '#ffffff' }}
                activeDot={{ r: 6, fill: '#be123c', strokeWidth: 2, stroke: '#ffffff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {peakDay && peakDay.mortality > 0 && (
          <div className="mt-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 flex items-center gap-2 text-xs text-amber-900 font-medium">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <span>
              Highest mortality recorded over last 30 days was on <strong>{peakDay.date}</strong> with <strong>{peakDay.mortality} bird(s)</strong> lost.
            </span>
          </div>
        )}
      </div>

      {/* TOP CLIENTS ALL TIME PERFORMANCE CHART */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
        <h3 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5 mb-4">
          <TrendingUp size={16} className="text-emerald-600" />
          Top Egg Incubator Customers (All-Time)
        </h3>

        {sortedTopClients.length === 0 ? (
          <p className="text-center text-slate-400 font-semibold p-4 bg-slate-50/50 rounded-2xl text-sm">
            Add egg batches in Incubator tab to rank customer counts.
          </p>
        ) : (
          <div className="space-y-4">
            {sortedTopClients.slice(0, 5).map((cl, i) => {
              // Find max for simple visual CSS chart percentage scaling
              const maxEggs = sortedTopClients[0].totalEggs || 1;
              const percent = Math.max(8, Math.min(100, (cl.totalEggs / maxEggs) * 100));

              return (
                <div key={cl.mark} className="space-y-1">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-700">
                      {i + 1}. {cl.name} <strong className="text-emerald-700">[{cl.mark}]</strong>
                    </span>
                    <span className="text-slate-500">{cl.totalEggs} eggs ({cl.batchesCount} egg batches)</span>
                  </div>
                  {/* CSS Progress Bar representing egg contribution */}
                  <div className="w-full bg-slate-100 h-4 rounded-lg overflow-hidden flex">
                    <div 
                      className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full rounded-lg text-[9px] text-white flex items-center pl-2 font-bold animate-pulse duration-1000"
                      style={{ width: `${percent}%` }}
                    >
                      {cl.totalEggs} Eggs
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* REVOLUTIONARY ONE-CLICK SPREADSHEET EXPORT PORTAL */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs">
        <h3 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-2 mb-1.5">
          <Download size={16} className="text-teal-600" />
          Download spreadsheets
        </h3>
        <p className="text-slate-400 text-xs font-semibold mb-5">
          Save CSV files that open in spreadsheet apps.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <button
            onClick={() => handleDownloadCSV('clients', db.clients)}
            className="p-3.5 bg-slate-50 border border-slate-100 hover:border-teal-200 hover:bg-teal-50/10 rounded-2xl flex flex-col items-center justify-center text-center gap-1 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={20} className="text-teal-600" />
            <span className="text-xs font-black text-slate-800">Clients</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase">{db.clients.length} rows</span>
          </button>

          <button
            onClick={() => handleDownloadCSV('incubator_records', db.incubator_records)}
            className="p-3.5 bg-slate-50 border border-slate-100 hover:border-teal-200 hover:bg-teal-50/10 rounded-2xl flex flex-col items-center justify-center text-center gap-1 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={20} className="text-teal-600" />
            <span className="text-xs font-black text-slate-800">Egg batches</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase">{db.incubator_records.length} rows</span>
          </button>

          <button
            onClick={() => handleDownloadCSV('flocks', db.flocks)}
            className="p-3.5 bg-slate-50 border border-slate-100 hover:border-teal-200 hover:bg-teal-50/10 rounded-2xl flex flex-col items-center justify-center text-center gap-1 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={20} className="text-teal-600" />
            <span className="text-xs font-black text-slate-800">Flocks</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase">{db.flocks.length} rows</span>
          </button>

          <button
            onClick={() => handleDownloadCSV('poultry_sales', db.poultry_sales)}
            className="p-3.5 bg-slate-50 border border-slate-100 hover:border-teal-200 hover:bg-teal-50/10 rounded-2xl flex flex-col items-center justify-center text-center gap-1 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={20} className="text-teal-600" />
            <span className="text-xs font-black text-slate-800">Sales</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase">{db.poultry_sales.length} rows</span>
          </button>

          <button
            onClick={() => handleDownloadCSV('feed_records', db.feed_records)}
            className="p-3.5 bg-slate-50 border border-slate-100 hover:border-teal-200 hover:bg-teal-50/10 rounded-2xl flex flex-col items-center justify-center text-center gap-1 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={20} className="text-teal-600" />
            <span className="text-xs font-black text-slate-800">Feed</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase">{db.feed_records.length} rows</span>
          </button>

          <button
            onClick={() => handleDownloadCSV('expenses', db.expenses)}
            className="p-3.5 bg-slate-50 border border-slate-100 hover:border-teal-200 hover:bg-teal-50/10 rounded-2xl flex flex-col items-center justify-center text-center gap-1 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={20} className="text-teal-600" />
            <span className="text-xs font-black text-slate-800">Expenses</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase">{db.expenses.length} rows</span>
          </button>

          <button
            onClick={() => handleDownloadCSV('mortality', farmRecordViews(db).mortality)}
            className="p-3.5 bg-slate-50 border border-slate-100 hover:border-rose-200 hover:bg-rose-50/10 rounded-2xl flex flex-col items-center justify-center text-center gap-1 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={20} className="text-rose-600" />
            <span className="text-xs font-black text-slate-800">Bird loss</span>
            <span className="text-[9px] text-slate-400 font-bold uppercase">{db.mortality.length} rows</span>
          </button>
          {[
            ['rabbits', db.rabbits || []], ['rabbit_litters', db.rabbit_litters || []],
            ['rabbit_breedings', db.rabbit_breedings || []], ['rabbit_hutches', db.rabbit_hutches || []],
            ['rabbit_moves', db.rabbit_moves || []], ['rabbit_losses', db.rabbit_losses || []],
            ['rabbit_sales', db.rabbit_sales || []], ['rabbit_eaten', db.rabbit_eaten || []], ['animal_care', db.animal_care || []],
            ['quail_egg_use', db.quail_egg_use || []], ['daily_egg_collections', db.daily_egg_collections || []]
          ].map(([name, rows]) => <button key={name as string} type="button" onClick={() => handleDownloadCSV(name as string, rows as any[])} className="p-3.5 bg-slate-50 border border-slate-100 hover:border-teal-200 rounded-2xl flex flex-col items-center justify-center text-center gap-1"><FileSpreadsheet size={20} className="text-teal-600" /><span className="text-xs font-bold text-slate-800">{(name as string).replaceAll('_', ' ')}</span><span className="text-xs text-slate-500">{(rows as any[]).length} rows</span></button>)}
        </div>

        <p className="mt-5 text-sm text-slate-600">Choose a record type to save its CSV file to this device.</p>

      </div>

    </div>
  );
}
