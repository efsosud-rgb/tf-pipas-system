<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FinancialTransaction;
use App\Models\Sale;
use Illuminate\Http\Request;
use Carbon\Carbon;

class FinancialController extends Controller
{
    public function index()
    {
        return response()->json(FinancialTransaction::orderBy('due_date', 'desc')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'description' => 'required|string',
            'type' => 'required|in:revenue,expense',
            'category' => 'required|string',
            'amount' => 'required|numeric|min:0.01',
            'due_date' => 'required|date',
            'payment_date' => 'nullable|date',
            'status' => 'required|in:pending,paid,cancelled',
            'payment_method' => 'nullable|string',
            'notes' => 'nullable|string'
        ]);

        $tx = FinancialTransaction::create($validated);
        return response()->json($tx, 201);
    }

    public function dre()
    {
        // DRE Gerencial TF Pipas System
        // 1. Receita Bruta de Vendas (Vendas do PDV + Receitas Financeiras)
        $posSalesTotal = (float) Sale::sum('total');
        $otherRevenues = (float) FinancialTransaction::where('type', 'revenue')->where('status', 'paid')->sum('amount');
        $grossRevenue = $posSalesTotal + $otherRevenues;

        // 2. Deduções da Receita Bruta (Impostos Simples Nacional / NFC-e ~ 6%)
        $taxDeductions = round($grossRevenue * 0.06, 2);
        $netRevenue = $grossRevenue - $taxDeductions;

        // 3. Custos dos Produtos Vendidos (CPV - Insumos: Bambu, Fibra, Papel, Cola)
        $rawMaterialExpenses = (float) FinancialTransaction::where('type', 'expense')
            ->where('category', 'Materia-Prima')
            ->where('status', 'paid')
            ->sum('amount');
        if ($rawMaterialExpenses == 0 && $grossRevenue > 0) {
            // Estimativa baseada no markup padrão se ainda não lançadas notas de compra
            $rawMaterialExpenses = round($grossRevenue * 0.28, 2);
        }

        // 4. Lucro Bruto / Margem de Contribuição
        $grossProfit = $netRevenue - $rawMaterialExpenses;
        $grossMarginPercent = $netRevenue > 0 ? round(($grossProfit / $netRevenue) * 100, 2) : 0;

        // 5. Despesas Operacionais (Administrativas, Comerciais, Fábrica, Logística)
        $operationalExpenses = (float) FinancialTransaction::where('type', 'expense')
            ->where('category', '!=', 'Materia-Prima')
            ->where('status', 'paid')
            ->sum('amount');

        // 6. EBITDA (Lucro antes de Juros, Impostos, Depreciação e Amortização)
        $ebitda = $grossProfit - $operationalExpenses;

        // 7. Depreciação / Investimentos
        $depreciation = round($operationalExpenses * 0.05, 2);

        // 8. Resultado Líquido do Exercício
        $netProfit = $ebitda - $depreciation;

        return response()->json([
            'period' => 'Mês Vigente (' . date('M/Y') . ')',
            'gross_revenue' => $grossRevenue,
            'pos_sales' => $posSalesTotal,
            'other_revenue' => $otherRevenues,
            'deductions_taxes' => $taxDeductions,
            'net_revenue' => $netRevenue,
            'cpv_materials' => $rawMaterialExpenses,
            'gross_profit' => $grossProfit,
            'gross_margin_percent' => $grossMarginPercent,
            'operational_expenses' => $operationalExpenses,
            'ebitda' => $ebitda,
            'depreciation' => $depreciation,
            'net_profit' => $netProfit,
        ]);
    }

    public function cashFlow()
    {
        // Fluxo de Caixa Realizado e Previsto
        $transactions = FinancialTransaction::orderBy('due_date', 'asc')->get();

        $inflowPaid = (float) FinancialTransaction::where('type', 'revenue')->where('status', 'paid')->sum('amount') + (float) Sale::sum('total');
        $outflowPaid = (float) FinancialTransaction::where('type', 'expense')->where('status', 'paid')->sum('amount');
        $currentBalance = $inflowPaid - $outflowPaid;

        $inflowPending = (float) FinancialTransaction::where('type', 'revenue')->where('status', 'pending')->sum('amount');
        $outflowPending = (float) FinancialTransaction::where('type', 'expense')->where('status', 'pending')->sum('amount');
        $projectedBalance = $currentBalance + $inflowPending - $outflowPending;

        return response()->json([
            'current_balance' => round($currentBalance, 2),
            'projected_balance' => round($projectedBalance, 2),
            'total_inflow_paid' => round($inflowPaid, 2),
            'total_outflow_paid' => round($outflowPaid, 2),
            'pending_receivables' => round($inflowPending, 2),
            'pending_payables' => round($outflowPending, 2),
            'transactions' => $transactions
        ]);
    }
}
