<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductionOrder;
use App\Models\Product;
use App\Models\Material;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductionOrderController extends Controller
{
    public function index()
    {
        return response()->json(ProductionOrder::with('product')->orderBy('id', 'desc')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'product_id' => 'required|exists:products,id',
            'quantity' => 'required|integer|min:1',
            'notes' => 'nullable|string'
        ]);

        $product = Product::with('bomItems.material')->findOrFail($validated['product_id']);
        $quantity = $validated['quantity'];

        // Verificar disponibilidade de insumos
        $missingMaterials = [];
        $totalCost = 0;

        foreach ($product->bomItems as $bom) {
            $needed = $bom->quantity_required * $quantity;
            if ($bom->material->stock_qty < $needed) {
                $missingMaterials[] = [
                    'material' => $bom->material->name,
                    'needed' => $needed,
                    'available' => $bom->material->stock_qty,
                    'unit' => $bom->material->unit
                ];
            }
            $totalCost += $needed * $bom->material->cost_unit;
        }

        if (!empty($missingMaterials)) {
            return response()->json([
                'success' => false,
                'message' => 'Estoque de matéria-prima insuficiente para esta ordem de produção!',
                'missing' => $missingMaterials
            ], 422);
        }

        // Executar a transformação atômica de insumos em produto acabado
        $order = DB::transaction(function () use ($product, $quantity, $totalCost, $validated) {
            // 1. Deduzir matérias-primas
            foreach ($product->bomItems as $bom) {
                $consumed = $bom->quantity_required * $quantity;
                $bom->material->decrement('stock_qty', $consumed);
            }

            // 2. Incrementar estoque do produto acabado
            $product->increment('stock_qty', $quantity);

            // Atualizar custo unitário estimado se relevante
            $product->cost_price = $quantity > 0 ? round($totalCost / $quantity, 2) : $product->cost_price;
            $product->save();

            // 3. Registrar Ordem de Produção
            $orderNumber = 'OP-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(2)));
            return ProductionOrder::create([
                'order_number' => $orderNumber,
                'product_id' => $product->id,
                'target_quantity' => $quantity,
                'produced_quantity' => $quantity,
                'status' => 'completed',
                'total_cost' => $totalCost,
                'notes' => $validated['notes'] ?? 'Transformação automática realizada com sucesso.',
                'completed_at' => now()
            ]);
        });

        return response()->json([
            'success' => true,
            'message' => "Ordem {$order->order_number} executada! {$quantity} unidades de '{$product->name}' produzidas e matérias-primas baixadas com sucesso.",
            'order' => $order->load('product'),
            'updated_product' => $product->fresh()
        ], 201);
    }
}
