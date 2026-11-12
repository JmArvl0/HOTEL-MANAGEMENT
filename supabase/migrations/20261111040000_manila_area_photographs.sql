-- Adds the approved, attributed Manila area photos. Only untouched demo seeds change.
begin;
alter table website_nearby_places drop constraint website_nearby_places_sample_image_check;
alter table website_nearby_places add constraint website_nearby_places_sample_image_check check(sample_image in('cafe','shopping','garden','transport','airport','city','rizal','museum','manila-transit'));
alter table website_route_guides drop constraint website_route_guides_sample_image_check;
alter table website_route_guides add constraint website_route_guides_sample_image_check check(sample_image in('cafe','shopping','garden','transport','airport','city','rizal','museum','manila-transit'));
do $$
declare h website_hotel_location%rowtype;
begin
 select * into h from website_hotel_location;
 if h.is_demo and h.location_revision=1 then
  update website_nearby_places set name='Rizal Park',description='Explore Rizal Park and its monument in Ermita, Manila. Check current visitor information before you go.',maps_search='Rizal Park Manila',sample_image='rizal',image_alt='Rizal Monument and Philippine flags at Rizal Park in Manila',distance_m=null,version=version+1,updated_at=now()
   where name='A quiet garden escape.' and sample_image='garden' and image_id is null and version=0;
  update website_nearby_places set name='City transport',description='Explore LRT-1 connections around Ermita. This photo shows Pedro Gil station; confirm your route and current service before travelling.',maps_search='Pedro Gil LRT station Manila',sample_image='manila-transit',image_alt='LRT-1 train beside the Pedro Gil station sign in Manila',distance_m=null,version=version+1,updated_at=now()
   where name='A transport hub' and sample_image='transport' and image_id is null and version=0;
  insert into website_nearby_places(category_id,name,description,maps_search,sample_image,image_alt,status,sort_order,location_revision)
   select c.id,'Manila museum district','Discover the National Museum complex in Manila. The photograph shows the National Museum of Fine Arts. Check opening hours and admission information with the museum.','National Museum of Fine Arts Manila','museum','Columned facade of the National Museum of Fine Arts in Manila','published',3,h.location_revision
   from website_place_categories c where c.slug='landmarks' and c.version=0 and c.status='published'
    and not exists(select 1 from website_nearby_places where name='Manila museum district');
 end if;
end $$;
commit;
