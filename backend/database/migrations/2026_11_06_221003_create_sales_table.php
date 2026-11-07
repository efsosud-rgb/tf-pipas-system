<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_number')->unique();
            $table->decimal('subtotal', 10, 2);
            $table->decimal('discount', 10, 2)->default(0);
            $table->decimal('total', 10, 2);
            $table->string('payment_method'); // pix, credit_card, debit_card, cash
            $table->decimal('amount_paid', 10, 2);
            $table->decimal('change_amount', 10, 2)->default(0);
            $table->string('customer_name')->nullable();
            $table->string('customer_cpf')->nullable();
            // Dados da NFC-e SEFAZ-RJ simulada
            $table->string('nfce_key', 44)->nullable();
            $table->string('nfce_protocol')->nullable();
            $table->string('nfce_series')->default('001');
            $table->integer('nfce_number')->nullable();
            $table->string('nfce_status')->default('AUTORIZADA');
            $table->string('nfce_qrcode_url')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
