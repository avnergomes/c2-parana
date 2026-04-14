-- Migration 023: Seed de 4 playbooks pre-configurados (Fase 4.A)

INSERT INTO playbooks (name, description, incident_type, severity_min, steps, estimated_duration_minutes)
VALUES
  (
    'Incendio Florestal',
    'Protocolo de resposta a risco composto de incendio florestal detectado via correlacao clima + focos FIRMS.',
    'incendio',
    'high',
    '[
      {"order": 1, "title": "Verificar condicoes meteorologicas", "description": "Consultar dados INMET do municipio: temperatura, umidade, vento, precipitacao nas ultimas 24h.", "responsible_role": "operator", "estimated_minutes": 5, "is_critical": true},
      {"order": 2, "title": "Confirmar focos via FIRMS/SIMEPAR", "description": "Validar quantidade e localizacao dos focos de incendio no satelite. Cruzar com hotspots InfoHidro.", "responsible_role": "operator", "estimated_minutes": 10, "is_critical": true},
      {"order": 3, "title": "Notificar Corpo de Bombeiros", "description": "Contato via canal de emergencia do municipio afetado. Registrar protocolo de atendimento.", "responsible_role": "commander", "estimated_minutes": 15, "is_critical": true},
      {"order": 4, "title": "Monitorar propagacao", "description": "Acompanhar evolucao dos focos a cada 3h via FIRMS. Verificar se area urbana esta ameacada.", "responsible_role": "operator", "estimated_minutes": 30, "is_critical": false},
      {"order": 5, "title": "Avaliar qualidade do ar", "description": "Verificar AQI nas cidades proximas. Se AQI > 150, emitir alerta de saude publica.", "responsible_role": "operator", "estimated_minutes": 10, "is_critical": false},
      {"order": 6, "title": "Atualizar COP e relatorio", "description": "Registrar evolucao no mapa operacional. Incluir no proximo relatorio situacional.", "responsible_role": "operator", "estimated_minutes": 10, "is_critical": false}
    ]'::jsonb,
    80
  ),
  (
    'Risco de Enchente',
    'Protocolo de resposta a risco hidrico composto: precipitacao intensa + nivel de rios em alerta.',
    'enchente',
    'high',
    '[
      {"order": 1, "title": "Verificar previsao de chuva", "description": "Consultar previsao INMET/SIMEPAR para as proximas 48h no municipio e bacia hidrografica.", "responsible_role": "operator", "estimated_minutes": 10, "is_critical": true},
      {"order": 2, "title": "Checar nivel dos rios", "description": "Verificar telemetria ANA/InfoHidro das estacoes do municipio. Comparar com historico de cheia.", "responsible_role": "operator", "estimated_minutes": 10, "is_critical": true},
      {"order": 3, "title": "Notificar Defesa Civil", "description": "Contato com Coordenadoria Municipal de Defesa Civil. Informar nivel de risco e areas vulneraveis.", "responsible_role": "commander", "estimated_minutes": 15, "is_critical": true},
      {"order": 4, "title": "Avaliar necessidade de evacuacao", "description": "Verificar areas de risco cadastradas. Estimar populacao em areas inundaveis.", "responsible_role": "commander", "estimated_minutes": 20, "is_critical": true},
      {"order": 5, "title": "Monitorar nivel dos rios", "description": "Acompanhar telemetria a cada 1h. Verificar previsao de vazao se disponivel.", "responsible_role": "operator", "estimated_minutes": 30, "is_critical": false},
      {"order": 6, "title": "Atualizar COP e relatorio", "description": "Marcar areas afetadas no mapa. Incluir no relatorio situacional com estimativa de danos.", "responsible_role": "operator", "estimated_minutes": 10, "is_critical": false}
    ]'::jsonb,
    95
  ),
  (
    'Surto Epidemiologico',
    'Protocolo de resposta a alerta sanitario: dengue nivel 3+ em municipio com tendencia de alta.',
    'surto',
    'medium',
    '[
      {"order": 1, "title": "Verificar municipios vizinhos", "description": "Consultar alert_level de dengue nos municipios limitrofes. Identificar cluster regional.", "responsible_role": "operator", "estimated_minutes": 15, "is_critical": true},
      {"order": 2, "title": "Validar dados InfoDengue", "description": "Confirmar semana epidemiologica, incidencia, e tendencia de projecao. Verificar se ha subnotificacao.", "responsible_role": "operator", "estimated_minutes": 10, "is_critical": true},
      {"order": 3, "title": "Notificar Secretaria de Saude", "description": "Informar nivel de alerta e projecao de 4 semanas. Solicitar relatorio de acoes de controle vetorial.", "responsible_role": "commander", "estimated_minutes": 15, "is_critical": true},
      {"order": 4, "title": "Monitorar evolucao semanal", "description": "Acompanhar SE a SE. Comparar com projecao do etl_dengue_projections. Alertar se desviar para cima.", "responsible_role": "operator", "estimated_minutes": 10, "is_critical": false},
      {"order": 5, "title": "Recomendar controle vetorial", "description": "Sugerir intensificacao de vistorias, nebulizacao, e comunicacao a populacao conforme protocolo MS.", "responsible_role": "commander", "estimated_minutes": 15, "is_critical": false}
    ]'::jsonb,
    65
  ),
  (
    'Onda de Calor',
    'Protocolo de resposta a temperatura extrema sustentada com impacto em saude e agricultura.',
    'onda_calor',
    'high',
    '[
      {"order": 1, "title": "Verificar duracao prevista", "description": "Consultar previsao INMET para os proximos 5 dias. Onda de calor = 3+ dias consecutivos acima de 35C.", "responsible_role": "operator", "estimated_minutes": 10, "is_critical": true},
      {"order": 2, "title": "Avaliar impacto agropecuario", "description": "Consultar dados DERAL/SEAB sobre culturas em fase critica. Estimar perdas potenciais.", "responsible_role": "operator", "estimated_minutes": 15, "is_critical": false},
      {"order": 3, "title": "Notificar Secretaria de Saude", "description": "Alerta para atendimento a idosos e criancas. Reforcar hidratacao em UBS e hospitais.", "responsible_role": "commander", "estimated_minutes": 10, "is_critical": true},
      {"order": 4, "title": "Alertar Secretaria de Agricultura", "description": "Comunicar risco de estresse hidrico. Sugerir medidas de irrigacao emergencial.", "responsible_role": "commander", "estimated_minutes": 10, "is_critical": false},
      {"order": 5, "title": "Monitorar temperatura e umidade", "description": "Acompanhar dados INMET a cada 6h. Verificar se AQI piora (inversao termica).", "responsible_role": "operator", "estimated_minutes": 15, "is_critical": false}
    ]'::jsonb,
    60
  );
