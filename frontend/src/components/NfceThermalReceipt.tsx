import React from 'react';
import { SaleReceipt } from '../types';
import { Printer, CheckCircle, ShieldCheck, QrCode } from 'lucide-react';

interface NfceThermalReceiptProps {
  receipt: SaleReceipt;
  onClose: () => void;
}

export const NfceThermalReceipt: React.FC<NfceThermalReceiptProps> = ({ receipt, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  const formatKey = (key: string) => {
    return key.replace(/(\d{4})/g, '$1 ').trim();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Actions */}
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between no-print">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold text-sm">NFC-e Autorizada pela SEFAZ-RJ</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg transition-all"
            >
              <Printer className="w-4 h-4" />
              Imprimir Bobina (80mm)
            </button>
            <button
              onClick={onClose}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-2 rounded-xl text-sm"
            >
              Fechar
            </button>
          </div>
        </div>

        {/* Cupom Fiscal Térmico Estilizado (Print Ready) */}
        <div className="overflow-y-auto p-6 bg-slate-950 flex justify-center print:p-0 print:m-0 print:bg-white">
          <div className="thermal-receipt w-[320px] bg-white text-black p-4 text-[11px] font-mono leading-tight shadow-md border border-gray-300 print:w-full print:border-none print:shadow-none">
            {/* Header Emissor */}
            <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
              <h2 className="font-bold text-sm tracking-wider">TF PIPAS SYSTEM LTDA</h2>
              <p>FÁBRICA E DISTRIBUIÇÃO DE PIPAS RJ</p>
              <p>CNPJ: 42.189.032/0001-85 - IE: 87.491.204</p>
              <p>Rua das Pipas, 500 - Bangu, Rio de Janeiro - RJ</p>
              <p className="mt-1 font-bold">DOCUMENTO AUXILIAR DA NFC-e</p>
              <p className="text-[9px] text-gray-700">Nota Fiscal de Consumidor Eletrônica</p>
            </div>

            {/* Itens */}
            <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
              <div className="flex justify-between font-bold border-b border-gray-300 pb-1 mb-1">
                <span>ITEM CÓD DESCRIÇÃO</span>
                <span>QTDxUNIT TOTAL</span>
              </div>
              {receipt.items.map((it, idx) => (
                <div key={idx} className="flex justify-between py-0.5">
                  <div className="truncate max-w-[190px]">
                    {String(idx + 1).padStart(2, '0')} {it.product?.name || 'Pipa TF'}
                  </div>
                  <div className="text-right whitespace-nowrap">
                    {it.quantity}x R${it.unit_price.toFixed(2)} = R${it.subtotal.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totais */}
            <div className="border-b border-dashed border-gray-400 pb-2 mb-2 space-y-1">
              <div className="flex justify-between">
                <span>Qtd. Total de Itens:</span>
                <span>{receipt.items.reduce((acc, i) => acc + i.quantity, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>R$ {receipt.subtotal.toFixed(2)}</span>
              </div>
              {receipt.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Desconto Aplicado:</span>
                  <span>- R$ {receipt.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-xs pt-1 border-t border-gray-300">
                <span>VALOR TOTAL A PAGAR:</span>
                <span>R$ {receipt.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span>Forma de Pagamento:</span>
                <span className="uppercase font-semibold">{receipt.payment_method}</span>
              </div>
              <div className="flex justify-between">
                <span>Valor Recebido:</span>
                <span>R$ {receipt.amount_paid.toFixed(2)}</span>
              </div>
              {receipt.change_amount > 0 && (
                <div className="flex justify-between font-bold">
                  <span>Troco Devolvido:</span>
                  <span>R$ {receipt.change_amount.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* SEFAZ-RJ Protocol & Key */}
            <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2 space-y-1 text-[10px]">
              <div className="flex items-center justify-center gap-1 font-bold text-gray-800">
                <ShieldCheck className="w-3.5 h-3.5 inline text-emerald-700" />
                <span>EMISSÃO SEFAZ-RJ HOMOLOGADA</span>
              </div>
              <p>Série: {receipt.nfce_series} | Número: {receipt.nfce_number}</p>
              <p>Data de Emissão: {new Date(receipt.created_at).toLocaleString('pt-BR')}</p>
              <p>Protocolo de Autorização: {receipt.nfce_protocol}</p>
              <div className="mt-2 text-left">
                <p className="font-bold text-[9px]">CHAVE DE ACESSO DA NFC-e:</p>
                <p className="font-mono text-[9px] break-all tracking-tight bg-gray-100 p-1 border border-gray-200">
                  {formatKey(receipt.nfce_key)}
                </p>
              </div>
            </div>

            {/* Consumidor e QR Code */}
            <div className="text-center space-y-2 pt-1">
              <div className="text-left text-[9px]">
                <p>CONSUMIDOR: {receipt.customer_name || 'CONSUMIDOR PADRÃO'}</p>
                {receipt.customer_cpf && <p>CPF: {receipt.customer_cpf}</p>}
              </div>

              {/* QR Code Simulado SEFAZ-RJ */}
              <div className="flex flex-col items-center justify-center p-2 bg-gray-50 border border-gray-200 rounded">
                <QrCode className="w-24 h-24 text-gray-900" />
                <span className="text-[8px] text-gray-600 mt-1">Consulte pela chave ou QR Code no portal SEFAZ-RJ</span>
              </div>
              <p className="text-[9px] text-gray-500 font-sans italic">
                TF Pipas System - Tradição e Alta Performance nos Céus do Brasil
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
