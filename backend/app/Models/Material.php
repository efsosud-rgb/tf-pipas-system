<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Material extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'category',
        'unit',
        'stock_qty',
        'min_stock',
        'cost_unit',
    ];

    public function bomItems()
    {
        return $this->hasMany(BomItem::class);
    }
}
