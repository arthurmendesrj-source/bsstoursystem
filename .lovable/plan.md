# Filtro de idioma em Roteiros

**Arquivo:** `src/routes/itineraries.tsx`

1. Novo estado: `const [language, setLanguage] = useState<string>("all")`.
2. No `filtered`, adicionar:
   ```ts
   if (language !== "all" && r.language !== language) return false;
   ```
3. No grid de filtros (~linha 435), expandir para acomodar mais um Select e adicionar:
   ```tsx
   <Select value={language} onValueChange={setLanguage}>
     <SelectTrigger><SelectValue /></SelectTrigger>
     <SelectContent>
       <SelectItem value="all">Todos os idiomas</SelectItem>
       <SelectItem value="en">Inglês</SelectItem>
       <SelectItem value="es">Espanhol</SelectItem>
       <SelectItem value="ru">Russo</SelectItem>
     </SelectContent>
   </Select>
   ```

A coluna `language` já existe e é preenchida pela IA durante o processamento. Documentos sem idioma detectado só aparecem em "Todos".
