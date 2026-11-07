<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('financial_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('description');
            $table->string('type'); // revenue (receita) or expense (despesa)
            $table->string('category'); // vendas, fornecedores, pessoal, energia, tributos, logistica, etc.
            $table->decimal('amount', 12, 2);
            $table->date('due_date'); // data de vencimento
            $table->date('payment_date')->nullable(); // data de efetivação
            $table->string('status')->default('paid'); // pending (a pagar/receber), paid (liquidado), cancelled
            $table->string('payment_method')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_transactions');
    }
};
