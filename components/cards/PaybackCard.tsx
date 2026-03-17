'use client';

import { useState } from 'react';
import type { PaybackResult } from '@/types/castai';
import Collapsible from '@/components/Collapsible';

interface Props {
  payback: PaybackResult;
  onFeeChange: (fee: number) => void;
  loading?: boolean;
}

export default function PaybackCard({ payback, onFeeChange, loading }: Props) {
  const [fee, setFee] = useState(payback.monthlyFee);

  if (loading) return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;

  const isPositive = payback.netSavingsToDate >= 0;

  return (
    <Collapsible title="ROI Payback Period" color="blue" className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        How quickly CAST AI pays for itself. Compares monthly savings against the platform fee to calculate break-even.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Payback</span>
          <span className="text-2xl font-bold text-blue-600">
            {payback.paybackMonths < 0 ? 'N/A' : `${payback.paybackMonths.toFixed(1)} mo`}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Break-Even Date</span>
          <span className="text-lg font-bold text-gray-900">{payback.breakEvenDate}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Monthly Savings</span>
          <span className="text-2xl font-bold text-emerald-600">
            ${payback.monthlySavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Net Savings to Date</span>
          <span className={`text-2xl font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
            ${Math.abs(payback.netSavingsToDate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 pt-3 border-t border-gray-50">
        <label className="text-xs text-gray-500 whitespace-nowrap">CAST AI Monthly Fee ($)</label>
        <input
          type="number"
          className="border border-gray-200 rounded px-2 py-1 text-sm w-32"
          value={fee}
          onChange={(e) => {
            const v = Number(e.target.value);
            setFee(v);
            onFeeChange(v);
          }}
        />
        <span className="text-xs text-gray-400">Change to recalculate payback period</span>
      </div>
    </Collapsible>
  );
}
