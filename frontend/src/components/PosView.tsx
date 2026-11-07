import React, { useState, useEffect, useRef } from 'react';
import { Product, CartItem, SaleReceipt } from '../types';
import { NfceThermalReceipt } from './NfceThermalReceipt';
import {
  Barcode,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  QrCode,
  CreditCard,
  Banknote,
  Search,
  Check,
  ReceiptText,
  AlertCircle,
  Keyboard
} from 'lucide-react';

interface PosViewProps {
  products: Product[];
  onSaleComplete: () => void;
}

export const PosView: React.FC<PosViewProps> = ({ products, onSaleComplete }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card' | 'debit_card' | 'cash'>('pix');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [customerName, setCustomerName] = useState('Consumidor Balcão RJ');
  const [customerCpf, setCustomerCpf] = useState('');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Focus barcode input on mount and F9
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Hotkeys de Balcão (F2, F4, F8, F9, F12)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length > 0) openCheckout();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) {
          // Remove o último item do carrinho
          setCart(prev => prev.slice(0, prev.length - 1));
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        setShowDiscountModal(prev => !prev);
      } else if (e.key === 'F9') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F12') {
        e.preventDefault();
        if (showCheckoutModal && !isProcessing) {
          handleConfirmCheckout();
        } else if (cart.length > 0) {
          openCheckout();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, showCheckoutModal, isProcessing]);

  const subtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const total = Math.max(0, subtotal - discount);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const found = products.find(
      p => p.barcode === barcodeInput.trim() || p.code.toLowerCase() === barcodeInput.trim().toLowerCase()
    );

    if (found) {
      addToCart(found);
      setBarcodeInput('');
      setErrorMessage('');
    } else {
      setErrorMessage(`Item não encontrado para o código: ${barcodeInput}`);
    }
  };

  const addToCart = (product: Product) => {
    if (product.stock_qty <= 0) {
      setErrorMessage(`Atenção: Produto ${product.name} está esgotado no estoque!`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_qty) {
          setErrorMessage(`Estoque máximo atingido (${product.stock_qty} un) para este item!`);
          return prev;
        }
        return prev.map(i =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId);
      return;
    }
    const product = products.find(p => p.id === productId);
    if (product && qty > product.stock_qty) {
      setErrorMessage(`Limite de estoque: apenas ${product.stock_qty} disponíveis.`);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const openCheckout = () => {
    setAmountPaid(total.toFixed(2));
    setShowCheckoutModal(true);
  };

  const handleConfirmCheckout = async () => {
    setIsProcessing(true);
    setErrorMessage('');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
          payment_method: paymentMethod,
          amount_paid: parseFloat(amountPaid) || total,
          discount: discount,
          customer_name: customerName || 'Consumidor Final',
          customer_cpf: customerCpf || null
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Falha ao processar checkout');
      }

      setReceipt(data.sale);
      setCart([]);
      setDiscount(0);
      setShowCheckoutModal(false);
      onSaleComplete();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro de comunicação com o servidor de PDV');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.barcode.includes(searchTerm)
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full">
      {/* Coluna Esquerda: Catálogo Rápido e Scanner de Código de Barras */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Barra de Atalhos e Scanner USB */}
        <div className="glass-panel p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-center justify-between border-l-4 border-l-red-500">
          <form onSubmit={handleBarcodeSubmit} className="flex-1 flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <Barcode className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" />
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Escaneie ou digite o código de barras (F9)..."
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-red-500 font-mono text-sm"
              />
            </div>
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md shrink-0"
            >
              Adicionar
            </button>
          </form>

          {/* Hotkeys Badges */}
          <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded border border-slate-700">
              <Keyboard className="w-3 h-3 text-red-400" /> F2 Checkout
            </span>
            <span className="bg-slate-800/80 px-2 py-1 rounded border border-slate-700">F4 Cancelar</span>
            <span className="bg-slate-800/80 px-2 py-1 rounded border border-slate-700">F8 Desconto</span>
            <span className="bg-slate-800/80 px-2 py-1 rounded border border-slate-700">F9 Scanner</span>
            <span className="bg-slate-800/80 px-2 py-1 rounded border border-slate-700 text-amber-300 font-semibold">F12 Emitir NFC-e</span>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-red-950/80 border border-red-500/50 text-red-200 p-3 rounded-xl flex items-center gap-2 text-sm">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Busca por texto e Catálogo de Produtos em Cards */}
        <div className="glass-panel p-4 rounded-2xl flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4 gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar raia, biquinho, combate, carretilha..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <span className="text-xs text-slate-400">{filteredProducts.length} itens no catálogo</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto max-h-[520px] pr-1">
            {filteredProducts.map(product => {
              const inStock = product.stock_qty > 0;
              return (
                <div
                  key={product.id}
                  onClick={() => inStock && addToCart(product)}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                    inStock
                      ? 'bg-slate-800/40 border-slate-700/80 hover:border-amber-500/60 hover:bg-slate-800/80 cursor-pointer'
                      : 'bg-red-950/20 border-red-900/40 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                        {product.category}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                        inStock ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-red-950 text-red-400'
                      }`}>
                        {product.stock_qty} un
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm text-white line-clamp-1">{product.name}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{product.description}</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-700/40">
                    <span className="font-mono text-xs text-slate-400">{product.barcode}</span>
                    <span className="text-base font-bold text-amber-400 font-mono">
                      R$ {Number(product.price).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Coluna Direita: Carrinho Transacional e Fechamento */}
      <div className="w-full lg:w-[420px] flex flex-col gap-4">
        <div className="glass-panel p-5 rounded-2xl flex flex-col flex-1 border-t-4 border-t-amber-500 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-amber-400" />
              <h2 className="font-bold text-lg text-white">Carrinho PDV</h2>
            </div>
            <span className="bg-red-900/50 text-red-200 text-xs px-2.5 py-1 rounded-full font-semibold border border-red-700/50">
              {cart.reduce((a, b) => a + b.quantity, 0)} itens
            </span>
          </div>

          {/* Lista de Itens do Carrinho */}
          <div className="flex-1 overflow-y-auto py-3 space-y-2.5 min-h-[250px] max-h-[380px]">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center py-10">
                <Barcode className="w-12 h-12 text-slate-600 mb-2 stroke-[1.5]" />
                <p className="text-sm">Carrinho vazio</p>
                <p className="text-xs text-slate-600">Escaneie um código ou clique nos produtos</p>
              </div>
            ) : (
              cart.map(item => (
                <div
                  key={item.product.id}
                  className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-xs text-white truncate">{item.product.name}</h4>
                    <span className="text-[11px] text-amber-400/90 font-mono">
                      R$ {Number(item.product.price).toFixed(2)} un
                    </span>
                  </div>

                  {/* Quantidade */}
                  <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="text-slate-400 hover:text-white"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-xs w-5 text-center font-bold text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="text-slate-400 hover:text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="font-bold text-xs text-white font-mono min-w-[65px] text-right">
                    R$ {(item.product.price * item.quantity).toFixed(2)}
                  </span>

                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-slate-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Resumo Financeiro */}
          <div className="pt-4 border-t border-slate-700/80 space-y-2">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Subtotal:</span>
              <span className="font-mono font-semibold">R$ {subtotal.toFixed(2)}</span>
            </div>

            {discount > 0 && (
              <div className="flex justify-between text-xs text-emerald-400">
                <span>Desconto Aplicado (F8):</span>
                <span className="font-mono">- R$ {discount.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between text-lg font-bold text-white pt-2 border-t border-slate-800">
              <span>Total a Pagar:</span>
              <span className="font-mono text-amber-400 text-xl">R$ {total.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setShowDiscountModal(true)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs font-medium border border-slate-700 flex items-center justify-center gap-1.5"
              >
                Desconto (F8)
              </button>
              <button
                onClick={() => setCart([])}
                disabled={cart.length === 0}
                className="bg-red-950/40 hover:bg-red-900/60 text-red-300 py-2 rounded-xl text-xs font-medium border border-red-800/50 disabled:opacity-40"
              >
                Limpar (F4)
              </button>
            </div>

            <button
              onClick={openCheckout}
              disabled={cart.length === 0}
              className="w-full bg-gradient-to-r from-red-600 via-amber-600 to-yellow-500 hover:from-red-500 hover:to-yellow-400 text-white font-bold py-3.5 rounded-xl shadow-lg disabled:opacity-40 transition-all flex items-center justify-center gap-2 mt-2 text-sm"
            >
              <ReceiptText className="w-5 h-5" />
              Finalizar Venda & NFC-e (F2 / F12)
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Desconto (F8) */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-base text-white mb-3">Aplicar Desconto Promocional</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Valor do Desconto (R$):</label>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  max={subtotal}
                  value={discount}
                  onChange={e => setDiscount(Math.min(subtotal, Math.max(0, parseFloat(e.target.value) || 0)))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDiscount(subtotal * 0.05)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-amber-300"
                >
                  5% Off
                </button>
                <button
                  onClick={() => setDiscount(subtotal * 0.10)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-amber-300"
                >
                  10% Off
                </button>
                <button
                  onClick={() => setDiscount(0)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300"
                >
                  Zerar
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowDiscountModal(false)}
                className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-semibold"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Checkout / Formas de Pagamento / Emissão NFC-e */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-white">Fechamento de Caixa - TF Pipas</h3>
                <p className="text-xs text-slate-400">SEFAZ-RJ NFC-e Modelo 65 - Emissão Homologada</p>
              </div>
              <span className="text-2xl font-mono font-bold text-amber-400">
                R$ {total.toFixed(2)}
              </span>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
              {/* Seleção da Forma de Pagamento */}
              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                  Forma de Pagamento
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('pix')}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                      paymentMethod === 'pix'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <QrCode className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs font-bold">PIX QR Code</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('credit_card')}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                      paymentMethod === 'credit_card'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <CreditCard className="w-5 h-5 text-blue-400" />
                    <span className="text-xs font-bold">Cartão Crédito</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('debit_card')}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                      paymentMethod === 'debit_card'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <CreditCard className="w-5 h-5 text-indigo-400" />
                    <span className="text-xs font-bold">Cartão Débito</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                      paymentMethod === 'cash'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/10'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Banknote className="w-5 h-5 text-emerald-400" />
                    <span className="text-xs font-bold">Dinheiro / Troco</span>
                  </button>
                </div>
              </div>

              {/* Pagamento em Dinheiro (Cálculo de Troco) */}
              {paymentMethod === 'cash' && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-400">Valor Entregue pelo Cliente:</label>
                    <input
                      type="number"
                      step="0.50"
                      value={amountPaid}
                      onChange={e => setAmountPaid(e.target.value)}
                      className="w-36 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-right font-mono text-white font-bold"
                    />
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-800">
                    <span className="text-slate-300">Troco a Devolver:</span>
                    <span className="text-lg font-bold font-mono text-emerald-400">
                      R$ {Math.max(0, (parseFloat(amountPaid) || 0) - total).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* PIX Dinâmico TF Pipas */}
              {paymentMethod === 'pix' && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center gap-4">
                  <div className="bg-white p-2 rounded-lg">
                    <QrCode className="w-24 h-24 text-slate-900" />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <span className="inline-block bg-emerald-950 text-emerald-400 text-[10px] px-2 py-0.5 rounded font-mono mb-1">
                      PIX DINÂMICO BANCO CENTRAL
                    </span>
                    <h5 className="font-semibold text-xs text-white">Chave TF Pipas PJ: 42.189.032/0001-85</h5>
                    <p className="text-[11px] text-slate-400 mt-1 font-mono break-all bg-slate-900 p-1.5 rounded">
                      00020126580014br.gov.bcb.pix013642189032000185520400005303986540{total.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              {/* Dados do Consumidor (Opcional para NFC-e) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Nome no Cupom:</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Consumidor Final"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">CPF na Nota (RJ):</label>
                  <input
                    type="text"
                    value={customerCpf}
                    onChange={e => setCustomerCpf(e.target.value)}
                    placeholder="000.000.000-00 (Opcional)"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-800/80 border-t border-slate-700 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-medium"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmCheckout}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold shadow-lg disabled:opacity-50"
              >
                {isProcessing ? (
                  <span>Emitindo SEFAZ-RJ...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Autorizar NFC-e & Concluir (F12)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visualizador do Cupom Fiscal NFC-e SEFAZ-RJ */}
      {receipt && (
        <NfceThermalReceipt
          receipt={receipt}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
};
