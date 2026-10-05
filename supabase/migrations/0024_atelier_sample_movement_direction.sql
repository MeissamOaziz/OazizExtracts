-- Sampling is its own movement direction: material physically leaves the batch for
-- the lab and does not come back. In a migration of its own because a new enum
-- value cannot be used in the same transaction that creates it.
alter type ops_movement_direction add value if not exists 'sample';
