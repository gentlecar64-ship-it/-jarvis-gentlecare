export const GENTLECARE_RULES = [
  {
    id: 'stock.dry-ice.low',
    priority: 1000,
    when: { path: 'resources.dryIceKg', lt: 100 },
    then: {
      type: 'notify',
      level: 'warning',
      message: 'Stock de glace carbonique faible : {{resources.dryIceKg}} kg restants.'
    }
  },
  {
    id: 'stock.dinitrol.low',
    priority: 1000,
    when: { path: 'resources.dinitrolLiters', lt: 5 },
    then: {
      type: 'notify',
      level: 'warning',
      message: 'Stock DINITROL faible : {{resources.dinitrolLiters}} L restants.'
    }
  },
  {
    id: 'cryo.block.no-machine',
    priority: 900,
    event: 'task.ready',
    when: {
      all: [
        { path: 'currentTask.id', eq: 'cryo' },
        { path: 'resources.cryoMachineAvailable', eq: false }
      ]
    },
    then: [
      { type: 'block-task', reason: 'Machine cryo indisponible.' },
      { type: 'notify', level: 'warning', message: '{{vehicle.name}} attend la machine cryo.' }
    ],
    stop: true
  },
  {
    id: 'cryo.block.no-compressor',
    priority: 890,
    event: 'task.ready',
    when: {
      all: [
        { path: 'currentTask.id', eq: 'cryo' },
        { path: 'resources.compressorAvailable', eq: false }
      ]
    },
    then: [
      { type: 'block-task', reason: 'Compresseur indisponible.' },
      { type: 'notify', level: 'warning', message: '{{vehicle.name}} attend le compresseur.' }
    ],
    stop: true
  },
  {
    id: 'cryo.block.not-enough-ice',
    priority: 880,
    event: 'task.ready',
    when: {
      all: [
        { path: 'currentTask.id', eq: 'cryo' },
        { path: 'resources.dryIceKg', lt: 20 }
      ]
    },
    then: [
      { type: 'block-task', reason: 'Glace carbonique insuffisante.' },
      { type: 'notify', level: 'critical', message: 'Impossible de lancer le cryonettoyage de {{vehicle.name}} : stock insuffisant.' }
    ],
    stop: true
  },
  {
    id: 'dinitrol.block.humidity',
    priority: 850,
    event: 'task.ready',
    when: {
      all: [
        { path: 'currentTask.id', eq: 'dinitrol' },
        { path: 'environment.humidity', gt: 80 }
      ]
    },
    then: [
      { type: 'block-task', reason: 'Humidité supérieure à 80 %.' },
      { type: 'notify', level: 'warning', message: 'Traitement DINITROL reporté pour {{vehicle.name}} : humidité {{environment.humidity}} %.' }
    ],
    stop: true
  },
  {
    id: 'drying.extend.humidity',
    priority: 700,
    event: 'task.started',
    when: {
      all: [
        { path: 'currentTask.id', eq: 'drying' },
        { path: 'environment.humidity', gt: 70 }
      ]
    },
    then: [
      { type: 'set', path: 'currentTask.dryingMultiplier', value: 1.25 },
      { type: 'notify', level: 'info', message: 'Temps de séchage de {{vehicle.name}} augmenté de 25 %.' }
    ]
  },
  {
    id: 'vehicle.wait-for-jarvis',
    priority: 100,
    event: 'task.completed',
    when: { path: 'vehicle.status', neq: 'COMPLETED' },
    then: [
      { type: 'set', path: 'vehicle.status', value: 'WAITING_FOR_JARVIS' },
      { type: 'notify', level: 'info', message: '{{vehicle.name}} reste en attente des instructions de Jarvis.' }
    ]
  }
];
