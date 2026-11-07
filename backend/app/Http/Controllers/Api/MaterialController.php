<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Material;
use Illuminate\Http\Request;

class MaterialController extends Controller
{
    public function index()
    {
        return response()->json(Material::all());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => 'required|unique:materials,code',
            'name' => 'required',
            'category' => 'required',
            'unit' => 'required',
            'stock_qty' => 'required|numeric',
            'min_stock' => 'nullable|numeric',
            'cost_unit' => 'required|numeric',
        ]);

        $material = Material::create($validated);
        return response()->json($material, 201);
    }

    public function show(Material $material)
    {
        return response()->json($material);
    }

    public function update(Request $request, Material $material)
    {
        $material->update($request->all());
        return response()->json($material);
    }

    public function destroy(Material $material)
    {
        $material->delete();
        return response()->json(['message' => 'Material removido']);
    }
}
