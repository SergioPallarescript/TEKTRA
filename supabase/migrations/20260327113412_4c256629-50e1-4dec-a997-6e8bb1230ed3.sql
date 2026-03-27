-- Allow order creators to update their orders
CREATE POLICY "Creator can update orders"
ON public.orders FOR UPDATE TO authenticated
USING (created_by = auth.uid());

-- Allow order creators to delete their orders
CREATE POLICY "Creator can delete orders"
ON public.orders FOR DELETE TO authenticated
USING (created_by = auth.uid());

-- Allow incident creators to delete their incidents
CREATE POLICY "Creator can delete incidents"
ON public.incidents FOR DELETE TO authenticated
USING (created_by = auth.uid());