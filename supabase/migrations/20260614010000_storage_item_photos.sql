-- QurTag — item photos storage bucket
--
-- Public-readable so finder pages can show hero photos without auth.
-- Writes are scoped to a user's household via the folder structure:
-- objects must live at <bucket>/<household_id>/<...>.

-- Bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-photos',
  'item-photos',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read item-photos (finder pages need this).
drop policy if exists "item-photos: public read" on storage.objects;
create policy "item-photos: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'item-photos');

-- Authenticated users can upload into their household's folder.
drop policy if exists "item-photos: members insert" on storage.objects;
create policy "item-photos: members insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1]::uuid in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

drop policy if exists "item-photos: members update" on storage.objects;
create policy "item-photos: members update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1]::uuid in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );

drop policy if exists "item-photos: members delete" on storage.objects;
create policy "item-photos: members delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1]::uuid in (
      select household_id from public.household_members where user_id = auth.uid()
    )
  );
