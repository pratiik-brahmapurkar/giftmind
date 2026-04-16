
-- Enum for relationship types
DO $$
BEGIN
  CREATE TYPE public.relationship_type AS ENUM (
    'partner','parent','sibling','close_friend','friend','colleague',
    'boss','acquaintance','in_law','child','mentor','new_relationship'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum for relationship depth
DO $$
BEGIN
  CREATE TYPE public.relationship_depth AS ENUM ('very_close','close','acquaintance');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum for age range
DO $$
BEGIN
  CREATE TYPE public.age_range AS ENUM ('under_18','18_25','25_35','35_50','50_65','65_plus');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum for gender
DO $$
BEGIN
  CREATE TYPE public.gender_option AS ENUM ('male','female','non_binary','prefer_not_to_say');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum for cultural context
DO $$
BEGIN
  CREATE TYPE public.cultural_context AS ENUM ('indian_hindu','indian_muslim','indian_christian','western','mixed','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Recipients table
CREATE TABLE IF NOT EXISTS public.recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship_type public.relationship_type NOT NULL,
  relationship_depth public.relationship_depth NOT NULL DEFAULT 'close',
  age_range public.age_range,
  gender public.gender_option,
  interests text[] DEFAULT '{}',
  cultural_context public.cultural_context,
  notes text,
  important_dates jsonb DEFAULT '[]',
  last_gift_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recipients" ON public.recipients;
CREATE POLICY "Users can view own recipients"
  ON public.recipients FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own recipients" ON public.recipients;
CREATE POLICY "Users can insert own recipients"
  ON public.recipients FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own recipients" ON public.recipients;
CREATE POLICY "Users can update own recipients"
  ON public.recipients FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own recipients" ON public.recipients;
CREATE POLICY "Users can delete own recipients"
  ON public.recipients FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_recipients_updated_at ON public.recipients;
CREATE TRIGGER update_recipients_updated_at
  BEFORE UPDATE ON public.recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
