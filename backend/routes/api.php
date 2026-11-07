<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\MaterialController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductionOrderController;
use App\Http\Controllers\Api\PosController;
use App\Http\Controllers\Api\FinancialController;

// Rota de Health Check
Route::get('/health', function () {
    return response()->json([
        'status' => 'healthy',
        'system' => 'TF Pipas System - ERP & Fábrica',
        'version' => '1.0.0',
        'environment' => config('app.env')
    ]);
});

// Materiais / Insumos
Route::apiResource('materials', MaterialController::class);

// Produtos Acabados
Route::get('products/barcode/{barcode}', [ProductController::class, 'findByBarcode']);
Route::apiResource('products', ProductController::class);

// Fábrica / Ordens de Produção
Route::apiResource('production-orders', ProductionOrderController::class)->only(['index', 'store']);

// PDV / Vendas e Emissão NFC-e
Route::get('pos/sales', [PosController::class, 'index']);
Route::get('pos/sales/{sale}', [PosController::class, 'show']);
Route::post('pos/checkout', [PosController::class, 'checkout']);

// Financeiro
Route::get('financial/transactions', [FinancialController::class, 'index']);
Route::post('financial/transactions', [FinancialController::class, 'store']);
Route::get('financial/dre', [FinancialController::class, 'dre']);
Route::get('financial/cashflow', [FinancialController::class, 'cashFlow']);
