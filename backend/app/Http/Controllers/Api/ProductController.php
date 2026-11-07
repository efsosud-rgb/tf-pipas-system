<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index()
    {
        return response()->json(Product::with('bomItems')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required|unique:products,code',
            'barcode' => 'required|unique:products,barcode',
            'name' => 'required',
            'category' => 'required',
            'price' => 'required|numeric',
            'cost_price' => 'nullable|numeric',
            'stock_qty' => 'required|integer',
            'min_stock' => 'nullable|integer',
        ]);

        $product = Product::create($validated);
        return response()->json($product, 201);
    }

    public function show(Product $product)
    {
        return response()->json($product->load('bomItems'));
    }

    public function findByBarcode($barcode)
    {
        $product = Product::where('barcode', $barcode)->first();
        if (!$product) {
            return response()->json(['error' => 'Produto não encontrado para o código de barras ' . $barcode], 404);
        }
        return response()->json($product);
    }
}
