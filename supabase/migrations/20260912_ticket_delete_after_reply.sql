drop policy if exists "tickets: owner delete answered or admin" on public.support_tickets;
create policy "tickets: owner delete answered or admin" on public.support_tickets for delete to authenticated
using (public.is_admin() or (user_id = auth.uid() and status in ('answered', 'closed')));
