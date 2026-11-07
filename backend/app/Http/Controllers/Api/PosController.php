<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PosController extends Controller
{
    public function index()
    {
        return response()->json(Sale::with('items.product')->orderBy('id', 'desc')->take(20)->get());
    }

    public function show(Sale $sale)
    {
        return response()->json($sale->load('items.product'));
    }

    public function checkout(Request $request)
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity' => 'required|integer|min:1',
            'payment_method' => 'required|in:pix,credit_card,debit_card,cash',
            'amount_paid' => 'required|numeric|min:0',
            'discount' => 'nullable|numeric|min:0',
            'customer_name' => 'nullable|string',
            'customer_cpf' => 'nullable|string',
        ]);

        $itemsInput = $validated['items'];
        $discount = $validated['discount'] ?? 0;
        $paymentMethod = $validated['payment_method'];
        $amountPaid = (float)$validated['amount_paid'];

        // Verificar estoque dos itens
        foreach ($itemsInput as $item) {
            $prod = Product::findOrFail($item['product_id']);
            if ($prod->stock_qty < $item['quantity']) {
                return response()->json([
                    'error' => "Estoque insuficiente para o produto '{$prod->name}'. Disponível: {$prod->stock_qty}"
                ], 422);
            }
        }

        $sale = DB::transaction(function () use ($itemsInput, $discount, $paymentMethod, $amountPaid, $validated) {
            $subtotal = 0;
            $itemsData = [];

            foreach ($itemsInput as $item) {
                $product = Product::lockForUpdate()->findOrFail($item['product_id']);
                $itemSubtotal = $product->price * $item['quantity'];
                $subtotal += $itemSubtotal;

                // Baixa automática no estoque do produto acabado
                $product->decrement('stock_qty', $item['quantity']);

                $itemsData[] = [
                    'product_id' => $product->id,
                    'quantity' => $item['quantity'],
                    'unit_price' => $product->price,
                    'subtotal' => $itemSubtotal,
                ];
            }

            $total = max(0, $subtotal - $discount);
            $changeAmount = ($paymentMethod === 'cash' && $amountPaid > $total) ? round($amountPaid - $total, 2) : 0;

            // Simulação de Emissão de NFC-e autorizada pela SEFAZ-RJ
            // Formato padrão da chave de 44 dígitos da NFC-e RJ: 33 (RJ) + AA MM + CNPJ (14) + mod (65) + serie (001) + nNF (9) + tipo (1) + codAleatorio (8) + DV (1)
            $ufRJ = '33';
            $aamm = date('ym');
            $cnpjTF = '42189032000185';
            $modelo = '65'; // 65 = NFC-e
            $serie = '001';
            $numNfce = rand(100000, 999999);
            $numNfcePadded = str_pad($numNfce, 9, '0', STR_PAD_LEFT);
            $tipoEmissao = '1'; // Normal
            $codigoAleatorio = rand(10000000, 99999999);
            $rawKey = "{$ufRJ}{$aamm}{$cnpjTF}{$modelo}{$serie}{$numNfcePadded}{$tipoEmissao}{$codigoAleatorio}";
            $dv = rand(0, 9);
            $nfceKey = $rawKey . $dv;
            $protocolo = '333' . date('ymd') . rand(10000000, 99999999);
            $qrCodeUrl = "https://www.fazenda.rj.gov.br/nfce/qrcode?p={$nfceKey}|2|1|1|" . sha1($nfceKey . '1');

            $invoiceNumber = 'NFCe-RJ-' . $serie . '-' . $numNfce;

            $newSale = Sale::create([
                'invoice_number' => $invoiceNumber,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'total' => $total,
                'payment_method' => $paymentMethod,
                'amount_paid' => $amountPaid,
                'change_amount' => $changeAmount,
                'customer_name' => $validated['customer_name'] ?? 'Consumidor Final',
                'customer_cpf' => $validated['customer_cpf'] ?? null,
                'nfce_key' => $nfceKey,
                'nfce_protocol' => $protocolo,
                'nfce_series' => $serie,
                'nfce_number' => $numNfce,
                'nfce_status' => 'AUTORIZADA - SEFAZ-RJ',
                'nfce_qrcode_url' => $qrCodeUrl,
            ]);

            foreach ($itemsData as $item) {
                $item['sale_id'] = $newSale->id;
                SaleItem::create($item);
            }

            return $newSale;
        });

        return response()->json([
            'success' => true,
            'message' => 'Venda finalizada com sucesso e NFC-e SEFAZ-RJ autorizada!',
            'sale' => $sale->load('items.product')
        ], 201);
    }
}
