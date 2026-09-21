-- Preserve the existing public UUID contract; domain keys remain bigint.
ALTER TABLE validation_runs ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX validation_runs_public_id_idx ON validation_runs(public_id);

-- The exact HTTP result and verified archive receipts are committed with finalization.
CREATE TABLE validation_run_outputs (
  validation_run_id bigint PRIMARY KEY REFERENCES validation_runs(id),
  result jsonb CHECK (jsonb_typeof(result) = 'object'),
  error jsonb CHECK (jsonb_typeof(error) = 'object'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  CHECK ((result IS NOT NULL) <> (error IS NOT NULL))
);
CREATE TRIGGER jade_history_immutable BEFORE UPDATE OR DELETE ON validation_run_outputs
FOR EACH ROW EXECUTE FUNCTION jade_reject_history_change();

CREATE FUNCTION jade_require_open_output() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE run_status text;
BEGIN
  SELECT execution_status INTO run_status FROM validation_runs
    WHERE id = NEW.validation_run_id FOR UPDATE;
  IF run_status IS NULL OR run_status NOT IN ('queued', 'running') THEN
    RAISE EXCEPTION 'Cannot attach an output to a missing or finalized validation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER jade_validation_output_guard BEFORE INSERT ON validation_run_outputs
FOR EACH ROW EXECUTE FUNCTION jade_require_open_output();
