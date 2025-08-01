{{- define "name" -}}
{{- default $.Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "responses-js.name" -}}
responses-js
{{- end -}}

{{- define "labels.standard" -}}
release: {{ $.Release.Name | quote }}
heritage: {{ $.Release.Service | quote }}
chart: "{{ include "name" . }}"
app: "{{ include "responses-js.name" . }}"
{{- end -}}

