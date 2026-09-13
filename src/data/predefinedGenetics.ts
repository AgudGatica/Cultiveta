/**
 * Base de datos predefinida de genéticas de cannabis para autocompletados y registro de cultivos.
 */

export interface PredefinedGenetic {
  seedBank: string;
  name: string;
  dominance: string;
  organolepticProfile: string;
  floweringDays: string;
  estimatedYield: string;
}

export const GENETICS_DATABASE: PredefinedGenetic[] = [
  // --- Sensi Seeds ---
  {
    seedBank: 'Sensi Seeds',
    name: 'Skunk #1',
    dominance: 'Híbrida (65% Sátiva)',
    organolepticProfile: 'Skunk acre (VSC), almizcle terroso, matices cítricos dulces',
    floweringDays: '45 - 50',
    estimatedYield: '500 - 600',
  },
  {
    seedBank: 'Sensi Seeds',
    name: 'Super Skunk',
    dominance: 'Índica (80%)',
    organolepticProfile: 'Cítrico dulce, notas terrosas orgánicas, especias afganas',
    floweringDays: '45 - 50',
    estimatedYield: '500 - 650',
  },
  {
    seedBank: 'Sensi Seeds',
    name: 'Jack Herer',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Hachís especiado, tonos de madera noble, skunk frutal',
    floweringDays: '70 - 84',
    estimatedYield: '500 - 600',
  },
  {
    seedBank: 'Sensi Seeds',
    name: 'Northern Lights #5',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Pino fresco perenne, resina dulce, madera oriental',
    floweringDays: '45 - 55',
    estimatedYield: '450 - 550',
  },
  {
    seedBank: 'Sensi Seeds',
    name: 'Big Bud',
    dominance: 'Índica (85%)',
    organolepticProfile: 'Melaza dulce, hachís tradicional, final picante terroso',
    floweringDays: '50 - 65',
    estimatedYield: '600 - 700',
  },

  // --- Serious Seeds ---
  {
    seedBank: 'Serious Seeds',
    name: 'Chronic',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Dulce suave, notas florales prominentes, matices agrios',
    floweringDays: '63 - 70',
    estimatedYield: '600 - 800',
  },
  {
    seedBank: 'Serious Seeds',
    name: 'AK-47',
    dominance: 'Sátiva (65%)',
    organolepticProfile: 'Dulce floral complejo, madera de sándalo, especias picantes',
    floweringDays: '53 - 63',
    estimatedYield: '350 - 500',
  },
  {
    seedBank: 'Serious Seeds',
    name: 'White Russian',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Aromas acres penetrantes, afrutado, resina de pino y almizcle',
    floweringDays: '56 - 63',
    estimatedYield: '350 - 500',
  },
  {
    seedBank: 'Serious Seeds',
    name: 'Bubble Gum',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Chicle de fresa inconfundible, dulzor empalagoso, floral',
    floweringDays: '56 - 63',
    estimatedYield: '300 - 450',
  },
  {
    seedBank: 'Serious Seeds',
    name: 'Kali Mist',
    dominance: 'Sátiva (90%)',
    organolepticProfile: 'Especias picantes, hierbas frescas forestales, pino sutil',
    floweringDays: '70 - 90',
    estimatedYield: '300 - 500',
  },

  // --- Sweet Seeds ---
  {
    seedBank: 'Sweet Seeds',
    name: 'Cream Caramel',
    dominance: 'Índica (90%)',
    organolepticProfile: 'Caramelo intenso tostado, tierra dulce, notas de regaliz',
    floweringDays: '56 - 63',
    estimatedYield: '400 - 550',
  },
  {
    seedBank: 'Sweet Seeds',
    name: 'Green Poison F1',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Dulce frutal muy intenso, macedonia tropical, matices skunk',
    floweringDays: '42 - 49',
    estimatedYield: '500 - 650',
  },
  {
    seedBank: 'Sweet Seeds',
    name: 'Gorilla Girl',
    dominance: 'Sátiva (60%)',
    organolepticProfile: 'Madera de ciprés intensa, cítricos ácidos, resina de pino',
    floweringDays: '63',
    estimatedYield: '400 - 550',
  },
  {
    seedBank: 'Sweet Seeds',
    name: 'Dark Devil Auto',
    dominance: 'Híbrida (55% Ind)',
    organolepticProfile: 'Dulce afrutado profundo, incienso oriental, frutos rojos',
    floweringDays: '60 (desde germ.)',
    estimatedYield: '400 - 600',
  },
  {
    seedBank: 'Sweet Seeds',
    name: 'Sweet Zenzation',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Caramelos de frutas artificiales, maderas nobles, limón ácido',
    floweringDays: '63',
    estimatedYield: '450 - 650',
  },

  // --- Barney's Farm ---
  {
    seedBank: "Barney's Farm",
    name: 'Acapulco Gold',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Cóctel de frutas exóticas tropicales, tierra dulce, pino',
    floweringDays: '60 - 70',
    estimatedYield: '500',
  },
  {
    seedBank: "Barney's Farm",
    name: 'Blue Gelato 41',
    dominance: 'Índica (60%)',
    organolepticProfile: 'Dulce abrumador, cítricos frescos, bayas ácidas y tierra',
    floweringDays: '63 - 70',
    estimatedYield: '600 - 700',
  },
  {
    seedBank: "Barney's Farm",
    name: 'Ayahuasca Purple',
    dominance: 'Índica (100%)',
    organolepticProfile: 'Avellana tostada exótica, papaya madura, frutas dulces',
    floweringDays: '55 - 65',
    estimatedYield: '650',
  },
  {
    seedBank: "Barney's Farm",
    name: 'Banana Punch',
    dominance: 'Índica (55%)',
    organolepticProfile: 'Plátano maduro confitado, bayas tropicales, cítricos sutiles',
    floweringDays: '60 - 65',
    estimatedYield: '600 - 650',
  },
  {
    seedBank: "Barney's Farm",
    name: 'Biscotti Mintz',
    dominance: 'Índica (80%)',
    organolepticProfile: 'Chocolate oscuro con menta, especias picantes, galleta rota',
    floweringDays: '56 - 63',
    estimatedYield: '600 - 650',
  },

  // --- Royal Queen Seeds ---
  {
    seedBank: 'Royal Queen Seeds',
    name: 'Special Queen 1',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Frutas dulces fermentadas, skunk tradicional, especias',
    floweringDays: '49 - 56',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Royal Queen Seeds',
    name: 'Royal Gorilla',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Tierra profunda forestal, pino fresco, limón cítrico',
    floweringDays: '56 - 70',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Royal Queen Seeds',
    name: 'Cookies Gelato',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Galleta horneada azucarada, menta fresca, cítricos',
    floweringDays: '56 - 63',
    estimatedYield: '550 - 600',
  },
  {
    seedBank: 'Royal Queen Seeds',
    name: 'Amnesia Haze',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Cítricos ácidos punzantes, pimienta negra, fondo terroso',
    floweringDays: '70 - 77',
    estimatedYield: '600 - 650',
  },
  {
    seedBank: 'Royal Queen Seeds',
    name: 'Triple G',
    dominance: 'Índica (85%)',
    organolepticProfile: 'Caramelo oscuro, chocolate amargo, combustible diésel',
    floweringDays: '55 - 60',
    estimatedYield: '525 - 575',
  },

  // --- Medical Seeds ---
  {
    seedBank: 'Medical Seeds',
    name: '1024',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Dulzor afrutado, almizcle denso, incienso litúrgico',
    floweringDays: '70 - 77',
    estimatedYield: '600',
  },
  {
    seedBank: 'Medical Seeds',
    name: '2046',
    dominance: 'Sátiva (100%)',
    organolepticProfile: 'Haze puro penetrante, incienso de iglesia, maderas nobles',
    floweringDays: '112 - 119',
    estimatedYield: '500',
  },
  {
    seedBank: 'Medical Seeds',
    name: 'Channel +',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Tierra húmeda profunda, skunk suave, toques dulces',
    floweringDays: '42 - 49',
    estimatedYield: '600',
  },
  {
    seedBank: 'Medical Seeds',
    name: 'Prozack',
    dominance: 'Índica (80%)',
    organolepticProfile: 'Hachís tradicional denso, tierra rústica, pino forestal',
    floweringDays: '63 - 70',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Medical Seeds',
    name: 'Y Griega CBD',
    dominance: 'Sátiva (60%)',
    organolepticProfile: 'Limón penetrante y ácido, almizcle sutil, tonos florales',
    floweringDays: '60 - 70',
    estimatedYield: '500',
  },

  // --- ACE Seeds ---
  {
    seedBank: 'ACE Seeds',
    name: 'Panama x Bangi Haze',
    dominance: 'Sátiva (85%)',
    organolepticProfile: 'Sinfonías florales, anís dulce penetrante, incienso fuerte',
    floweringDays: '70 - 77',
    estimatedYield: '450 - 550',
  },
  {
    seedBank: 'ACE Seeds',
    name: 'Golden Tiger',
    dominance: 'Sátiva (100%)',
    organolepticProfile: 'Limón cítrico ácido, mandarina, madera, resina pino',
    floweringDays: '77 - 98',
    estimatedYield: '500 - 600',
  },
  {
    seedBank: 'ACE Seeds',
    name: 'Malawi',
    dominance: 'Sátiva (100%)',
    organolepticProfile: 'Madera aceitosa, corteza de limón, zanahoria dulce orgánica',
    floweringDays: '70 - 91',
    estimatedYield: '550 - 650',
  },
  {
    seedBank: 'ACE Seeds',
    name: 'Purple Haze x Malawi',
    dominance: 'Sátiva (100%)',
    organolepticProfile: 'Mermelada de bayas oscuras, cítricos ácidos, incienso',
    floweringDays: '91 - 105',
    estimatedYield: '500 - 600',
  },
  {
    seedBank: 'ACE Seeds',
    name: 'Killer A5 Haze',
    dominance: 'Sátiva (80%)',
    organolepticProfile: 'Incienso holandés añejo, maderas podridas, toques cárnicos',
    floweringDays: '63 - 84',
    estimatedYield: '550 - 650',
  },

  // --- Fast Buds 420 ---
  {
    seedBank: 'Fast Buds 420',
    name: 'Gorilla Cookies Auto',
    dominance: 'Híbrida (45S/55I)',
    organolepticProfile: 'Galleta dulce horneada, kush terroso, gas y pino',
    floweringDays: '70 (desde germ.)',
    estimatedYield: '500 - 600',
  },
  {
    seedBank: 'Fast Buds 420',
    name: 'Strawberry Gorilla Auto',
    dominance: 'Híbrida (55S/45I)',
    organolepticProfile: 'Fresa dulce confitada, frutas rojas, fondo skunk sutil',
    floweringDays: '70 (desde germ.)',
    estimatedYield: '450 - 600',
  },
  {
    seedBank: 'Fast Buds 420',
    name: 'Gelato Auto',
    dominance: 'Sátiva (55%)',
    organolepticProfile: 'Cítrico dulce, helado cremoso denso, notas terrosas',
    floweringDays: '63 (desde germ.)',
    estimatedYield: '400 - 550',
  },
  {
    seedBank: 'Fast Buds 420',
    name: 'Six Shooter Auto',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Perfil floral complejo, madera de pino fresca, cítricos',
    floweringDays: '70 (desde germ.)',
    estimatedYield: '500 - 650',
  },
  {
    seedBank: 'Fast Buds 420',
    name: 'Glue Gelato Auto',
    dominance: 'Índica (60%)',
    organolepticProfile: 'Picante, floral orgánico, chocolate negro, tierra oscura',
    floweringDays: '63 - 70 (desde germ.)',
    estimatedYield: '500 - 600',
  },

  // --- Dutch Passion ---
  {
    seedBank: 'Dutch Passion',
    name: 'Auto Skywalker Haze',
    dominance: 'Sátiva (75%)',
    organolepticProfile: 'Cítrico penetrante fuerte, neblina (haze), pino resinoso',
    floweringDays: '84 (desde germ.)',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Dutch Passion',
    name: 'Kerosene Krash',
    dominance: 'Índica (80%)',
    organolepticProfile: 'Diésel puro abrasivo, gas acre intenso, tierra húmeda',
    floweringDays: '56',
    estimatedYield: '400 - 500',
  },
  {
    seedBank: 'Dutch Passion',
    name: 'Passion #1',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Tierra fresca removida, cítricos sutiles, resina de hachís',
    floweringDays: '42 - 49',
    estimatedYield: '400',
  },
  {
    seedBank: 'Dutch Passion',
    name: 'Sugar Bomb Punch',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Frutas dulces confitadas, macedonia floral, toque a uva',
    floweringDays: '63',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Dutch Passion',
    name: 'Mokum\'s Tulip',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Tulipán floral inusual, masa de galleta, dulce cremoso',
    floweringDays: '56 - 63',
    estimatedYield: '400 - 500',
  },

  // --- Mephisto Genetics ---
  {
    seedBank: 'Mephisto Genetics',
    name: 'Mango Runtz',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Mango maduro jugoso, caramelos azucarados, frutas',
    floweringDays: '70 - 75 (desde germ.)',
    estimatedYield: '400 - 500',
  },
  {
    seedBank: 'Mephisto Genetics',
    name: 'MephistOreoz',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Chocolate oscuro profundo, vainilla, tierra tostada',
    floweringDays: '65 - 75 (desde germ.)',
    estimatedYield: '400 - 500',
  },
  {
    seedBank: 'Mephisto Genetics',
    name: 'Double Grape',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Uva morada intensa, vino dulce fermentado, gas sutil',
    floweringDays: '65 - 70 (desde germ.)',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Mephisto Genetics',
    name: 'Forum Stomper',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Masa de galleta cruda, especias fuertes, menta dulce',
    floweringDays: '65 - 75 (desde germ.)',
    estimatedYield: '400 - 500',
  },
  {
    seedBank: 'Mephisto Genetics',
    name: 'Alien Vs Triangle',
    dominance: 'Sátiva (60%)',
    organolepticProfile: 'Pino forestal agresivo, cítricos acres, skunk profundo',
    floweringDays: '70 - 80 (desde germ.)',
    estimatedYield: '450 - 550',
  },

  // --- Humboldt Seed Company ---
  {
    seedBank: 'Humboldt Seed Company',
    name: 'Blueberry Muffin',
    dominance: 'Índica (80%)',
    organolepticProfile: 'Muffins de arándano caliente, vainilla densa, frutas',
    floweringDays: '45',
    estimatedYield: '500',
  },
  {
    seedBank: 'Humboldt Seed Company',
    name: 'Hella Jelly',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Cereza artificial, fresa en almíbar, algodón de azúcar',
    floweringDays: '45',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Humboldt Seed Company',
    name: 'Freakshow',
    dominance: 'Sátiva (90%)',
    organolepticProfile: 'Pino herbáceo sutil, cítricos ácidos, tierra rústica',
    floweringDays: '65',
    estimatedYield: '450',
  },
  {
    seedBank: 'Humboldt Seed Company',
    name: 'Magic Melon',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Melón dulce maduro, frutas tropicales, miel, gasóleo',
    floweringDays: '50',
    estimatedYield: '500 - 600',
  },
  {
    seedBank: 'Humboldt Seed Company',
    name: 'All Gas OG',
    dominance: 'Índica (80%)',
    organolepticProfile: 'Pino penetrante oscuro, skunk agresivo, gasóleo puro',
    floweringDays: '55',
    estimatedYield: '500 - 600',
  },

  // --- Genehtik Seeds ---
  {
    seedBank: 'Genehtik Seeds',
    name: 'Kritikal Bilbo',
    dominance: 'Índica (75%)',
    organolepticProfile: 'Frutas dulces muy maduras, skunk pungente, almizcle',
    floweringDays: '45 - 50',
    estimatedYield: '550 - 600',
  },
  {
    seedBank: 'Genehtik Seeds',
    name: 'Amnesia Bilbo',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Haze tradicional intenso, incienso metálico, madera',
    floweringDays: '65 - 75',
    estimatedYield: '550 - 600',
  },
  {
    seedBank: 'Genehtik Seeds',
    name: 'Txees Bilbo',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Queso curado pestilente, tierra húmeda, fondo dulzón',
    floweringDays: '50 - 60',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Genehtik Seeds',
    name: 'Super Silver Bilbo',
    dominance: 'Sátiva (80%)',
    organolepticProfile: 'Especias picantes, incienso litúrgico, maderas y limón',
    floweringDays: '65 - 75',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Genehtik Seeds',
    name: 'Kroma',
    dominance: 'Índica (80%)',
    organolepticProfile: 'Bayas del bosque ácidas, frutas oscuras, tierra húmeda',
    floweringDays: '55 - 60',
    estimatedYield: '500 - 550',
  },

  // --- Seed Junky Genetics ---
  {
    seedBank: 'Seed Junky Genetics',
    name: 'Permanent Marker',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Jabón floral persistente, dulces artificiales, gas fuerte',
    floweringDays: '60 - 65',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Seed Junky Genetics',
    name: 'Animal Mints',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Menta verde fresca, masa de galleta densa, gasóleo',
    floweringDays: '63 - 70',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Seed Junky Genetics',
    name: 'Wedding Cake',
    dominance: 'Índica (60%)',
    organolepticProfile: 'Vainilla dulce, tierra húmeda, masa cruda, pimienta',
    floweringDays: '63',
    estimatedYield: '500 - 600',
  },
  {
    seedBank: 'Seed Junky Genetics',
    name: 'Kush Mints',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Menta verde potente, pino bosque, diésel, tierra negra',
    floweringDays: '60 - 65',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Seed Junky Genetics',
    name: 'Jealousy',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Helado lácteo azucarado, tierra rica, caramelos densos',
    floweringDays: '60 - 65',
    estimatedYield: '500 - 550',
  },

  // --- Cookies Seed Bank ---
  {
    seedBank: 'Cookies Seed Bank',
    name: 'Gary Payton',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Pimienta negra molida, lavanda fresca, gasóleo quemado',
    floweringDays: '60 - 65',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Cookies Seed Bank',
    name: 'Cereal Milk',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Leche azucarada sobrante, vainilla, cereales de frutas',
    floweringDays: '60 - 65',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Cookies Seed Bank',
    name: 'London Pound Cake',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Limón glaseado ácido, bayas, pastel cremoso y tierra',
    floweringDays: '60 - 65',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Cookies Seed Bank',
    name: 'Blanco',
    dominance: 'Sátiva (60%)',
    organolepticProfile: 'Químicos agresivos (Chem), flores blancas, pino resina',
    floweringDays: '60 - 65',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Cookies Seed Bank',
    name: 'Berry Pie',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Waffle dulce tostado, mermelada de bayas rojas, nata',
    floweringDays: '60 - 65',
    estimatedYield: '500 - 550',
  },

  // --- Perfect Tree ---
  {
    seedBank: 'Perfect Tree',
    name: 'Cherrymosa',
    dominance: 'Sátiva (60%)',
    organolepticProfile: 'Cereza madura intensa vibrante, cítricos acres, gas',
    floweringDays: '56 - 63',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Perfect Tree',
    name: 'Peach Ozz',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Melocotón dulce, mandarina jugosa, azúcar sutil, tierra',
    floweringDays: '63',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Perfect Tree',
    name: 'Mimozz',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Naranja ácida penetrante, melocotón en almíbar, frutas',
    floweringDays: '56 - 63',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Perfect Tree',
    name: 'Lemon Curd',
    dominance: 'Índica (60%)',
    organolepticProfile: 'Crema de limón pastelera, lácteos suaves, cítricos',
    floweringDays: '56 - 63',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Perfect Tree',
    name: 'Pink Gasoline',
    dominance: 'Índica (60%)',
    organolepticProfile: 'Combustible (gas) fuerte, helado dulce, bayas rojas',
    floweringDays: '56 - 63',
    estimatedYield: '500 - 550',
  },

  // --- Ethos Genetics ---
  {
    seedBank: 'Ethos Genetics',
    name: 'Banana Jealousy Auto',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Plátano asado dulce, tierra profunda, gas y crema',
    floweringDays: '70 (desde germ.)',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Ethos Genetics',
    name: 'Mandarin Cookies',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Naranja penetrante, cítricos ácidos, masa de galleta',
    floweringDays: '60 - 63',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Ethos Genetics',
    name: 'Colin OG',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Gasolina pura abrasiva, uvas oscuras, tierra mojada',
    floweringDays: '60 - 65',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Ethos Genetics',
    name: 'Crescendo',
    dominance: 'Sátiva (60%)',
    organolepticProfile: 'Tierra dulce arcillosa, gas penetrante, frutas ácidas',
    floweringDays: '63 - 70',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Ethos Genetics',
    name: 'Planet of the Grapes',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Uva artificial fuerte, químicos acres, gas y tierra',
    floweringDays: '60 - 63',
    estimatedYield: '500 - 550',
  },

  // --- Silent Seeds ---
  {
    seedBank: 'Silent Seeds',
    name: 'B-45',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Cítricos exóticos punzantes, tierra profunda, floral',
    floweringDays: '58 - 65',
    estimatedYield: '550 - 600',
  },
  {
    seedBank: 'Silent Seeds',
    name: 'L.A. Vanilla Cake',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Vainilla confitada rica, crema pastelera, frutos secos',
    floweringDays: '60 - 65',
    estimatedYield: '550 - 600',
  },
  {
    seedBank: 'Silent Seeds',
    name: 'Zkittlez 2.0',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Frutas tropicales complejas, golosinas ácidas, dulce',
    floweringDays: '56 - 63',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Silent Seeds',
    name: 'Watermelon Zkittlez',
    dominance: 'Índica (60%)',
    organolepticProfile: 'Sandía jugosa madura, caramelos de fruta, gas suave',
    floweringDays: '56 - 63',
    estimatedYield: '500 - 550',
  },
  {
    seedBank: 'Silent Seeds',
    name: 'Starfire OG',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Pino agresivo oscuro, gasóleo (gas), tierra rústica',
    floweringDays: '55 - 60',
    estimatedYield: '550 - 600',
  },

  // --- Zamnesia Seeds ---
  {
    seedBank: 'Zamnesia Seeds',
    name: 'Green Cure CBD F1',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Dulce frutal suave, tierra fresca, toques especiados',
    floweringDays: '70 (desde germ.)',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Zamnesia Seeds',
    name: 'Runtz Auto',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Caramelos artificiales, frutas tropicales, dulzor cremoso',
    floweringDays: '70 (desde germ.)',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Zamnesia Seeds',
    name: 'Sticky Beast Auto',
    dominance: 'Índica (60%)',
    organolepticProfile: 'Dulce sutil meloso, tierra mojada, tonos florales',
    floweringDays: '49 - 56 (desde germ.)',
    estimatedYield: '350 - 400',
  },
  {
    seedBank: 'Zamnesia Seeds',
    name: 'Blueberry Automatic',
    dominance: 'Índica (70%)',
    organolepticProfile: 'Arándano suave silvestre, notas florales leves, tierra',
    floweringDays: '56 - 63 (desde germ.)',
    estimatedYield: '400 - 450',
  },
  {
    seedBank: 'Zamnesia Seeds',
    name: 'Amnesia Haze Auto',
    dominance: 'Sátiva (60%)',
    organolepticProfile: 'Cítrico ácido picante, especias calientes, fondo haze',
    floweringDays: '70 - 77 (desde germ.)',
    estimatedYield: '350 - 400',
  },

  // --- DNA Genetics ---
  {
    seedBank: 'DNA Genetics',
    name: 'Holy Grail Kush',
    dominance: 'Híbrida (50/50)',
    organolepticProfile: 'Pino intenso amargo, gas penetrante, tierra húmeda',
    floweringDays: '63',
    estimatedYield: '500 - 600',
  },
  {
    seedBank: 'DNA Genetics',
    name: 'Chocolope',
    dominance: 'Sátiva (95%)',
    organolepticProfile: 'Cacao tostado oscuro, café amargo, melón suave terroso',
    floweringDays: '63 - 70',
    estimatedYield: '500 - 600',
  },
  {
    seedBank: 'DNA Genetics',
    name: 'LA Confidential',
    dominance: 'Índica (100%)',
    organolepticProfile: 'Pino oscuro forestal, tierra profunda, especias afganas',
    floweringDays: '49 - 56',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'DNA Genetics',
    name: 'Tangie',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Mandarina fresca vibrante, cítricos ácidos, skunk leve',
    floweringDays: '63 - 70',
    estimatedYield: '450 - 550',
  },
  {
    seedBank: 'DNA Genetics',
    name: 'Kosher Kush',
    dominance: 'Índica (80%)',
    organolepticProfile: 'Tierra rica oscura, frutas maduras, pino y gas penetrante',
    floweringDays: '63 - 70',
    estimatedYield: '450 - 550',
  },

  // --- Soma Seeds ---
  {
    seedBank: 'Soma Seeds',
    name: 'Amnesia Haze',
    dominance: 'Sátiva (70%)',
    organolepticProfile: 'Limón fresco ácido, especias picantes, madera oriental',
    floweringDays: '84 - 90',
    estimatedYield: '450 - 500',
  },
  {
    seedBank: 'Soma Seeds',
    name: 'Somango',
    dominance: 'Índica (75%)',
    organolepticProfile: 'Mango maduro dulce, ensalada de frutas, notas florales',
    floweringDays: '63 - 70',
    estimatedYield: '400 - 450',
  },
  {
    seedBank: 'Soma Seeds',
    name: 'NYCD (NYC Diesel)',
    dominance: 'Sátiva (60%)',
    organolepticProfile: 'Pomelo (toronja) rojo cítrico, diésel agrio y penetrante',
    floweringDays: '63 - 70',
    estimatedYield: '400 - 500',
  },
  {
    seedBank: 'Soma Seeds',
    name: 'Lavender',
    dominance: 'Índica (80%)',
    organolepticProfile: 'Flores de lavanda, hachís afgano oscuro, madera de cedro',
    floweringDays: '56 - 63',
    estimatedYield: '400 - 450',
  },
  {
    seedBank: 'Soma Seeds',
    name: 'Buddha\'s Sister',
    dominance: 'Índica (60%)',
    organolepticProfile: 'Cereza ácida, pastel rancio horneado, toques acres leves',
    floweringDays: '63 - 70',
    estimatedYield: '400 - 500',
  },
];

/*
================================================================================
EJEMPLO DE USO EN COMPONENTE REACT:
================================================================================

import React, { useState, useMemo } from 'react';
import { GENETICS_DATABASE, PredefinedGenetic } from '../data/predefinedGenetics';

export function GeneticsAutocomplete({ onSelect }: { onSelect: (g: PredefinedGenetic) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBank, setSelectedBank] = useState<string>('ALL');

  // Obtener lista única de bancos de semillas disponibles
  const seedBanks = useMemo(() => {
    return Array.from(new Set(GENETICS_DATABASE.map(g => g.seedBank))).sort();
  }, []);

  // Filtrado reactivo por término de búsqueda (nombre o banco) y/o filtro de banco
  const filteredGenetics = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    return GENETICS_DATABASE.filter(genetic => {
      // Coincidencia con banco seleccionado en selector
      const matchesBank = selectedBank === 'ALL' || genetic.seedBank === selectedBank;
      if (!matchesBank) return false;

      // Si no hay texto de búsqueda, pasa el filtro de banco
      if (!term) return true;

      // Coincidencia en nombre de la variedad o nombre del banco
      const matchesName = genetic.name.toLowerCase().includes(term);
      const matchesBankName = genetic.seedBank.toLowerCase().includes(term);

      return matchesName || matchesBankName;
    });
  }, [searchTerm, selectedBank]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select 
          value={selectedBank} 
          onChange={(e) => setSelectedBank(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="ALL">Todos los bancos</option>
          {seedBanks.map(bank => (
            <option key={bank} value={bank}>{bank}</option>
          ))}
        </select>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por variedad o banco..."
          className="border p-2 rounded flex-1"
        />
      </div>

      <ul className="max-h-60 overflow-y-auto border rounded divide-y">
        {filteredGenetics.map((item) => (
          <li
            key={`${item.seedBank}-${item.name}`}
            onClick={() => onSelect(item)}
            className="p-2.5 hover:bg-emerald-50 cursor-pointer"
          >
            <div className="font-semibold text-emerald-900">{item.name}</div>
            <div className="text-xs text-gray-500">
              {item.seedBank} • {item.dominance} • Floración: {item.floweringDays} días
            </div>
            <div className="text-xs text-gray-600 italic">
              Aroma: {item.organolepticProfile}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
*/
