<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FinancialTransaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'description',
        'type',
        'category',
        'amount',
        'due_date',
        'payment_date',
        'status',
        'payment_method',
        'notes',
    ];
}
