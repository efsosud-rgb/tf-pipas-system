<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\FinancialTransaction;
use App\Models\Sale;
use App\Models\SaleItem;
use Carbon\Carbon;

class FinancialSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Insumos e Fornecedores de Fábrica (CPV)
        FinancialTransaction::create([
            'description' => 'Compra Lote 20.000 Varetas de Bambu Tratado - Fornecedor SP',
            'type' => 'expense',
            'category' => 'Materia-Prima',
            'amount' => 3000.00,
            'due_date' => Carbon::now()->subDays(15)->toDateString(),
            'payment_date' => Carbon::now()->subDays(15)->toDateString(),
            'status' => 'paid',
            'payment_method' => 'TED / PIX',
        ]);

        FinancialTransaction::create([
            'description' => 'Fardo 10.000 Folhas Seda Especial TF Carmim/Amarelo',
            'type' => 'expense',
            'category' => 'Materia-Prima',
            'amount' => 1800.00,
            'due_date' => Carbon::now()->subDays(10)->toDateString(),
            'payment_date' => Carbon::now()->subDays(10)->toDateString(),
            'status' => 'paid',
            'payment_method' => 'Boleto',
        ]);

        FinancialTransaction::create([
            'description' => 'Lote 500 Tubos Linha 10 e Linha 24 Corrente',
            'type' => 'expense',
            'category' => 'Materia-Prima',
            'amount' => 3250.00,
            'due_date' => Carbon::now()->addDays(5)->toDateString(),
            'status' => 'pending',
            'payment_method' => 'Boleto a Prazo',
        ]);

        // 2. Despesas Fixas e Operacionais
        FinancialTransaction::create([
            'description' => 'Aluguel do Galpão da Fábrica e Loja Física TF (Bangu/RJ)',
            'type' => 'expense',
            'category' => 'Operacional / Aluguel',
            'amount' => 2500.00,
            'due_date' => Carbon::now()->startOfMonth()->addDays(5)->toDateString(),
            'payment_date' => Carbon::now()->startOfMonth()->addDays(5)->toDateString(),
            'status' => 'paid',
            'payment_method' => 'PIX',
        ]);

        FinancialTransaction::create([
            'description' => 'Conta de Energia Light RJ (Fábrica de Pipas)',
            'type' => 'expense',
            'category' => 'Utilidades',
            'amount' => 640.00,
            'due_date' => Carbon::now()->addDays(3)->toDateString(),
            'status' => 'pending',
            'payment_method' => 'Débito Automático',
        ]);

        FinancialTransaction::create([
            'description' => 'Folha Salarial - Equipe de Produção e Armação Artesanal',
            'type' => 'expense',
            'category' => 'Pessoal',
            'amount' => 5800.00,
            'due_date' => Carbon::now()->startOfMonth()->addDays(6)->toDateString(),
            'payment_date' => Carbon::now()->startOfMonth()->addDays(6)->toDateString(),
            'status' => 'paid',
            'payment_method' => 'Folha Bancária',
        ]);

        // 3. Receitas Adicionais de Vendas Atacado
        FinancialTransaction::create([
            'description' => 'Venda Atacado Lote 5.000 Pipas - Distribuidora Carioca',
            'type' => 'revenue',
            'category' => 'Vendas Atacado',
            'amount' => 12500.00,
            'due_date' => Carbon::now()->subDays(7)->toDateString(),
            'payment_date' => Carbon::now()->subDays(7)->toDateString(),
            'status' => 'paid',
            'payment_method' => 'PIX PJ',
        ]);

        FinancialTransaction::create([
            'description' => 'Venda Atacado Encomenda Temporada Férias de Julho',
            'type' => 'revenue',
            'category' => 'Vendas Atacado',
            'amount' => 8400.00,
            'due_date' => Carbon::now()->addDays(12)->toDateString(),
            'status' => 'pending',
            'payment_method' => 'Boleto Bancário',
        ]);

        // 4. Vendas Históricas no PDV para alimentar gráficos e DRE
        $sale1 = Sale::create([
            'invoice_number' => 'NFCe-RJ-001-512019',
            'subtotal' => 185.00,
            'discount' => 5.00,
            'total' => 180.00,
            'payment_method' => 'pix',
            'amount_paid' => 180.00,
            'change_amount' => 0,
            'customer_name' => 'Carlos Festival Pipas RJ',
            'customer_cpf' => '893.210.450-11',
            'nfce_key' => '33261142189032000185650010005120191845129910',
            'nfce_protocol' => '33326110689123019',
            'nfce_status' => 'AUTORIZADA - SEFAZ-RJ',
            'nfce_qrcode_url' => 'https://www.fazenda.rj.gov.br/nfce/qrcode?p=33261142189032000185650010005120191845129910|2|1|1|7a89b',
            'created_at' => Carbon::now()->subDays(2),
        ]);
        SaleItem::create(['sale_id' => $sale1->id, 'product_id' => 1, 'quantity' => 40, 'unit_price' => 3.50, 'subtotal' => 140.00]);
        SaleItem::create(['sale_id' => $sale1->id, 'product_id' => 4, 'quantity' => 1, 'unit_price' => 45.00, 'subtotal' => 45.00]);

        $sale2 = Sale::create([
            'invoice_number' => 'NFCe-RJ-001-512020',
            'subtotal' => 95.00,
            'discount' => 0,
            'total' => 95.00,
            'payment_method' => 'credit_card',
            'amount_paid' => 95.00,
            'change_amount' => 0,
            'customer_name' => 'Pedro Afonso',
            'customer_cpf' => '321.654.987-22',
            'nfce_key' => '33261142189032000185650010005120201845129911',
            'nfce_protocol' => '33326110689123020',
            'nfce_status' => 'AUTORIZADA - SEFAZ-RJ',
            'nfce_qrcode_url' => 'https://www.fazenda.rj.gov.br/nfce/qrcode?p=33261142189032000185650010005120201845129911|2|1|1|8b90c',
            'created_at' => Carbon::now()->subDays(1),
        ]);
        SaleItem::create(['sale_id' => $sale2->id, 'product_id' => 2, 'quantity' => 10, 'unit_price' => 4.20, 'subtotal' => 42.00]);
        SaleItem::create(['sale_id' => $sale2->id, 'product_id' => 3, 'quantity' => 5, 'unit_price' => 6.00, 'subtotal' => 30.00]);
        SaleItem::create(['sale_id' => $sale2->id, 'product_id' => 1, 'quantity' => 6, 'unit_price' => 3.50, 'subtotal' => 21.00]);
    }
}
