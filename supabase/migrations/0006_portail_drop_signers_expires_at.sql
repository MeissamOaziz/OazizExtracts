-- signers.expires_at is redundant now — expiry is stored once on signer_tokens.
alter table signers drop column expires_at;
