<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Material;
use App\Models\Product;
use App\Models\BomItem;

class FactorySeeder extends Seeder
{
    public function run(): void
    {
        // Matérias-Primas Oficiais TF Pipas
        $bambu50 = Material::create([
            'code' => 'MP-BAMBU-50',
            'name' => 'Vareta de Bambu Central 50cm',
            'category' => 'Bambu',
            'unit' => 'unidade',
            'stock_qty' => 5000,
            'min_stock' => 500,
            'cost_unit' => 0.15,
        ]);

        $fibra18 = Material::create([
            'code' => 'MP-FIBRA-18',
            'name' => 'Vareta de Fibra de Vidro 1.8mm (Arco)',
            'category' => 'Fibra',
            'unit' => 'unidade',
            'stock_qty' => 4500,
            'min_stock' => 400,
            'cost_unit' => 0.22,
        ]);

        $papelSeda = Material::create([
            'code' => 'MP-SEDA-COLOR',
            'name' => 'Papel de Seda Estampado TF Carmim/Laranja',
            'category' => 'Papel',
            'unit' => 'folha',
            'stock_qty' => 3000,
            'min_stock' => 300,
            'cost_unit' => 0.18,
        ]);

        $linha10 = Material::create([
            'code' => 'MP-LINHA-10',
            'name' => 'Carretel Linha 10 Corrente Pura 500 jardas',
            'category' => 'Linha',
            'unit' => 'tubo',
            'stock_qty' => 200,
            'min_stock' => 20,
            'cost_unit' => 6.50,
        ]);

        $cola = Material::create([
            'code' => 'MP-COLA-PVA',
            'name' => 'Cola Especial PVA para Pipas TF',
            'category' => 'Insumo Químico',
            'unit' => 'litro',
            'stock_qty' => 50,
            'min_stock' => 5,
            'cost_unit' => 14.00,
        ]);

        // Produtos Acabados TF Pipas
        $pipaRaia = Product::create([
            'code' => 'PROD-RAIA-40',
            'barcode' => '789100100101',
            'name' => 'Pipa Raia 40cm TF Carmim Especial',
            'category' => 'Pipa Raia',
            'description' => 'Pipa Raia ultraleve de alta velocidade, acabamento em bambu tratado e fibra flexível.',
            'price' => 3.50,
            'cost_price' => 0.85,
            'stock_qty' => 150,
            'min_stock' => 30,
        ]);

        $pipaBiquinho = Product::create([
            'code' => 'PROD-BIQ-45',
            'barcode' => '789100100102',
            'name' => 'Pipa Biquinho 45cm Sunset TF',
            'category' => 'Pipa Biquinho',
            'description' => 'Modelo aerodinâmico para ventos médios com seda laranja e amarela.',
            'price' => 4.20,
            'cost_price' => 0.95,
            'stock_qty' => 120,
            'min_stock' => 25,
        ]);

        $pipaCombate = Product::create([
            'code' => 'PROD-COMB-55',
            'barcode' => '789100100103',
            'name' => 'Pipa Combate Real 55cm TF Glass',
            'category' => 'Pipa Combate',
            'description' => 'Pipa clássica de combate carioca reforçada com dupla fibra e bico blindado.',
            'price' => 6.00,
            'cost_price' => 1.40,
            'stock_qty' => 90,
            'min_stock' => 20,
        ]);

        $carretilhaTF = Product::create([
            'code' => 'PROD-CARR-10',
            'barcode' => '789100100104',
            'name' => 'Carretilha de Madeira TF Pipas 21cm com Rolamento',
            'category' => 'Acessórios',
            'description' => 'Carretilha profissional com duplo rolamento blindado e acabamento envernizado.',
            'price' => 45.00,
            'cost_price' => 22.00,
            'stock_qty' => 35,
            'min_stock' => 5,
        ]);

        // BOM (Bill of Materials) - Fórmulas de Produção
        // Para produzir 1 Pipa Raia 40cm:
        BomItem::create([
            'product_id' => $pipaRaia->id,
            'material_id' => $bambu50->id,
            'quantity_required' => 1.0, // 1 vareta de bambu
        ]);
        BomItem::create([
            'product_id' => $pipaRaia->id,
            'material_id' => $fibra18->id,
            'quantity_required' => 1.0, // 1 arco fibra
        ]);
        BomItem::create([
            'product_id' => $pipaRaia->id,
            'material_id' => $papelSeda->id,
            'quantity_required' => 1.0, // 1 folha de seda
        ]);
        BomItem::create([
            'product_id' => $pipaRaia->id,
            'material_id' => $cola->id,
            'quantity_required' => 0.005, // 5ml cola
        ]);

        // Para produzir 1 Pipa Biquinho 45cm:
        BomItem::create([
            'product_id' => $pipaBiquinho->id,
            'material_id' => $bambu50->id,
            'quantity_required' => 1.0,
        ]);
        BomItem::create([
            'product_id' => $pipaBiquinho->id,
            'material_id' => $fibra18->id,
            'quantity_required' => 1.0,
        ]);
        BomItem::create([
            'product_id' => $pipaBiquinho->id,
            'material_id' => $papelSeda->id,
            'quantity_required' => 1.0,
        ]);

        // Para produzir 1 Pipa Combate 55cm:
        BomItem::create([
            'product_id' => $pipaCombate->id,
            'material_id' => $bambu50->id,
            'quantity_required' => 1.0,
        ]);
        BomItem::create([
            'product_id' => $pipaCombate->id,
            'material_id' => $fibra18->id,
            'quantity_required' => 2.0, // 2 varetas cruzadas
        ]);
        BomItem::create([
            'product_id' => $pipaCombate->id,
            'material_id' => $papelSeda->id,
            'quantity_required' => 1.5,
        ]);
    }
}
