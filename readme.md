# Команды для тестирования

## 1. Показать вывод всех параметров

```bash
yarn start --help
```

# 2. Получить прямые зависимости пакета

### Через API

```bash
yarn start -p clap -o clap.png
```

### Указать точную версию

```bash
yarn start -p clap --pv 4.5.50 -o clap.png
```

### Указать глубину определения зависимостей

```bash
yarn start -p clap -d 1 clap.png
```

### Локально + с ASCII

```bash
yarn start -p A -t test-repos/simple.json -o simple-direct.png -a
```

### С фильтром:

```bash
yarn start -p A -t test-repos/simple.json -a -f C -o simple-filtered.png
```

# 3. Демонстрация работы с циклическими зависимостями

### Получение прямых зависимостей

```bash
yarn start -p A -t test-repos/cyclic.json -a -o cyclic.png
```

### получение прямых зависимостей с фильтром

```bash
yarn start -p A -t test-repos/cyclic.json -a -f C -o cyclic-filtered.png
```

### Получение обратных зависимостей

```bash
yarn start -p B -t test-repos/cyclic.json -r
```
