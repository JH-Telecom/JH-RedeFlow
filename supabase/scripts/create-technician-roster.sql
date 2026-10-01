DO $roster$
DECLARE
  team_row record;
  assistant_name text;
  lead_id uuid;
  registration_prefix text;
  registration_value text;
BEGIN
  FOR team_row IN
    SELECT * FROM (VALUES
      ('Adriano Jose de Melo', ARRAY[]::text[]),
      ('Gabriel Oliveira', ARRAY[]::text[]),
      ('Antonio Carlos de Lima Pinheiro', ARRAY['Matheus Henrique De Lima Souza']),
      ('Francinaldo lima de Freitas', ARRAY['Vitor Rocha']),
      ('José Everaldo Lopes Dos Santos', ARRAY['Michael Henrique de Oliveira Sarmento']),
      ('Marcos Antônio Ramos dos santos', ARRAY['Vitor Rafael Matias de Bessa']),
      ('Caíque da Silva Bento Aguiar', ARRAY['Kawã dos Santos ernardo', 'Lucas riquelme Barreto']),
      ('Juvercino Santos Martins', ARRAY['Iago de Oliveira Ramos']),
      ('Weverton José Domingos jacquet', ARRAY['Gilvone Junior Pereira De Santana']),
      ('Guilherme Matias Chaves', ARRAY['Matias Barbosa Ferreira']),
      ('Gustavo Henrique Teixeira Porto', ARRAY['Andre Pereira da Silva']),
      ('Ricardo Mendes de Sousa', ARRAY['João chagas vieira']),
      ('Rafael Rodrigo de Freitas Araujo', ARRAY['Juvenal Pereira da Silva Neto', 'Francisco Roberto']),
      ('Jose Leidson da Silva Barbosa', ARRAY['Rodrigo Aureliano Barboza']),
      ('Paulo Herculano', ARRAY['Francisco Roberto']),
      ('Geraldo celestino da Silva Junior', ARRAY['Ryan Robert Manoel Da cunha']),
      ('Rodrigo Henrique Cruz da Silva', ARRAY['Danilo Leonel De Carvalho']),
      ('Kauan Felipe Ribeito Silva', ARRAY['Édson Luan Parras de Oliveira Alves']),
      ('Rogério Alves Ferreira', ARRAY['Lucas Mendes da Costa']),
      ('Wesley Ferreira da Silva', ARRAY[]::text[]),
      ('Lucas Oliveira Santos', ARRAY['Paulo Vinicius Santos da Silva']),
      ('Bruno Dias Gimenes', ARRAY['Silvio Andre Constâncio Pereira Junior']),
      ('Alécio Quierione Brito', ARRAY['Erick Silva dos Santos']),
      ('Robson Jose da Silva Oliveira', ARRAY['Micael Feitosa freita']),
      ('Maicon Torres dos Santos', ARRAY['Guilherme Lopes Dias']),
      ('Carlos Roberto Oliveira Filho', ARRAY['Nelson Quaitti leopoudo']),
      ('Leandro da Silva Costa', ARRAY[]::text[])
    ) AS roster(technician_name, assistant_names)
  LOOP
    SELECT id INTO lead_id
    FROM public.technicians
    WHERE deleted_at IS NULL
      AND team_role = 'Tecnico'
      AND lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(team_row.technician_name), '\s+', ' ', 'g'))
    ORDER BY created_at, id
    LIMIT 1;

    IF lead_id IS NULL THEN
      registration_prefix := 'TEC';
      SELECT format('%s-%s', registration_prefix, lpad(candidate::text, 3, '0')) INTO registration_value
      FROM generate_series(1, 999999) AS candidates(candidate)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.technicians
        WHERE upper(registration) = format('%s-%s', registration_prefix, lpad(candidate::text, 3, '0'))
      )
      ORDER BY candidate
      LIMIT 1;

      IF registration_value IS NULL THEN
        RAISE EXCEPTION 'Não há matrícula TEC disponível para %.', team_row.technician_name;
      END IF;

      INSERT INTO public.technicians (name, registration, region, shift, current_status, active, active_override, team_role)
      VALUES (team_row.technician_name, registration_value, NULL, 'A definir', 'Disponivel', true, false, 'Tecnico')
      RETURNING id INTO lead_id;
    END IF;

    FOREACH assistant_name IN ARRAY team_row.assistant_names
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.technicians
        WHERE deleted_at IS NULL
          AND team_role = 'Auxiliar'
          AND lead_technician_id = lead_id
          AND lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(assistant_name), '\s+', ' ', 'g'))
      ) THEN
        registration_prefix := 'AUX';
        SELECT format('%s-%s', registration_prefix, lpad(candidate::text, 3, '0')) INTO registration_value
        FROM generate_series(1, 999999) AS candidates(candidate)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.technicians
          WHERE upper(registration) = format('%s-%s', registration_prefix, lpad(candidate::text, 3, '0'))
        )
        ORDER BY candidate
        LIMIT 1;

        IF registration_value IS NULL THEN
          RAISE EXCEPTION 'Não há matrícula AUX disponível para %.', assistant_name;
        END IF;

        INSERT INTO public.technicians (name, registration, region, shift, current_status, active, active_override, team_role, lead_technician_id)
        VALUES (assistant_name, registration_value, NULL, 'A definir', 'Disponivel', true, false, 'Auxiliar', lead_id);
      END IF;
    END LOOP;
  END LOOP;
END;
$roster$;

SELECT team_role, count(*) AS total
FROM public.technicians
WHERE deleted_at IS NULL
  AND registration ~ '^(TEC|AUX)-[0-9]+$'
GROUP BY team_role
ORDER BY team_role;