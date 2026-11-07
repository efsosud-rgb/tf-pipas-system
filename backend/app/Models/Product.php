<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'barcode',
        'name',
        'category',
        'description',
        'price',
        'cost_price',
        'stock_qty',
        'min_stock',
        'image_url',
    ];

    public function bomItems()
    {
        return $this->hasMany(BomItem::class)->with('material');
    }

    public function productionOrders()
    {
        return $this->hasMany(ProductionOrder::class);
    }
}
