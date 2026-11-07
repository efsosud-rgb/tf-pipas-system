<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProductionOrder extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_number',
        'product_id',
        'target_quantity',
        'produced_quantity',
        'status',
        'total_cost',
        'notes',
        'completed_at',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
