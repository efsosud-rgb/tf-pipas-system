<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Sale extends Model
{
    use HasFactory;

    protected $fillable = [
        'invoice_number',
        'subtotal',
        'discount',
        'total',
        'payment_method',
        'amount_paid',
        'change_amount',
        'customer_name',
        'customer_cpf',
        'nfce_key',
        'nfce_protocol',
        'nfce_series',
        'nfce_number',
        'nfce_status',
        'nfce_qrcode_url',
    ];

    public function items()
    {
        return $this->hasMany(SaleItem::class)->with('product');
    }
}
